import tempfile
import unittest
from pathlib import Path

from core.customer_memory import (
    CONSENT_ACCEPTED,
    CONSENT_UNKNOWN,
    CustomerMemoryRepository,
    generate_anonymous_customer_id,
    is_valid_anonymous_customer_id,
)


class CustomerMemoryTests(unittest.TestCase):
    def test_generates_valid_anonymous_customer_id(self):
        customer_id = generate_anonymous_customer_id()

        self.assertTrue(is_valid_anonymous_customer_id(customer_id))
        self.assertTrue(customer_id.startswith("anon_"))

    def test_identify_creates_pseudonymous_profile(self):
        with tempfile.TemporaryDirectory() as tmp:
            repository = CustomerMemoryRepository(str(Path(tmp) / "profiles.json"))

            profile = repository.identify(consent_accepted=False)

            self.assertTrue(is_valid_anonymous_customer_id(profile.anonymous_customer_id))
            self.assertEqual(profile.consent_status, CONSENT_UNKNOWN)
            self.assertEqual(profile.visit_count, 1)
            self.assertEqual(profile.favorite_items, ())
            self.assertEqual(profile.avoided_items, ())

    def test_identify_reuses_existing_profile_and_keeps_consent(self):
        with tempfile.TemporaryDirectory() as tmp:
            repository = CustomerMemoryRepository(str(Path(tmp) / "profiles.json"))

            first = repository.identify(consent_accepted=True)
            second = repository.identify(first.anonymous_customer_id, consent_accepted=False)

            self.assertEqual(second.anonymous_customer_id, first.anonymous_customer_id)
            self.assertEqual(second.consent_status, CONSENT_ACCEPTED)
            self.assertEqual(second.visit_count, 2)

    def test_invalid_customer_id_is_not_reused(self):
        with tempfile.TemporaryDirectory() as tmp:
            repository = CustomerMemoryRepository(str(Path(tmp) / "profiles.json"))

            profile = repository.identify("customer_named_value", consent_accepted=True)

            self.assertNotEqual(profile.anonymous_customer_id, "customer_named_value")
            self.assertTrue(is_valid_anonymous_customer_id(profile.anonymous_customer_id))

    def test_get_rejects_invalid_customer_id(self):
        with tempfile.TemporaryDirectory() as tmp:
            repository = CustomerMemoryRepository(str(Path(tmp) / "profiles.json"))

            self.assertIsNone(repository.get("not-anonymous"))


if __name__ == "__main__":
    unittest.main()
