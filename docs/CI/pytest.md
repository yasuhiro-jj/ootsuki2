# Pytest 実行ルール

## 正式コマンド

```bash
python -m pytest -q
```

このリポジトリでは `pytest.ini` で `-p no:cacheprovider` を設定している。Windows のローカル検証環境で、pytest が全テスト完了後に cacheprovider の `.pytest_cache` 作成処理で停止する事象が確認されたため、テスト結果キャッシュを使わない構成を正式な実行方法にする。

## 調査根拠

PR #18 ブランチだけでなく、PR #16 マージ直後の `origin/main` でも `python -m pytest -q` は 100% 表示後に終了せず 180 秒で timeout した。

faulthandler で確認した停止位置:

```text
_pytest/cacheprovider.py pytest_sessionfinish
_pytest/cacheprovider.py set
_pytest/cacheprovider.py _mkdir
tempfile.py mkdtemp
```

`python -m pytest -q -p no:cacheprovider` では `origin/main` と PR #18 ブランチの両方で正常終了した。

## 注意

- テストを省略していない。pytest の結果キャッシュだけを無効化する。
- `.pytest_cache` に依存する運用はしない。
- CI でも `python -m pytest -q` を使えば、`pytest.ini` により cacheprovider 無効化が適用される。
