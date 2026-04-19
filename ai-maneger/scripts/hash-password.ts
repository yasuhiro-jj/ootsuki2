import { hashPassword } from "../lib/auth/users";

const password = process.argv[2];

if (!password) {
  console.error("usage: tsx scripts/hash-password.ts <password>");
  process.exit(1);
}

console.log(hashPassword(password));

