from backend.app.security import hash_password, hash_session_token, verify_password


def test_password_hashes_are_salted_and_verified() -> None:
    first = hash_password("password")
    second = hash_password("password")

    assert first != second
    assert verify_password("password", first)
    assert not verify_password("wrong", first)


def test_password_verification_rejects_malformed_hashes() -> None:
    assert not verify_password("password", "malformed")
    assert not verify_password(
        "password",
        "pbkdf2_sha256$600000$not-base64$not-base64",
    )
    assert not verify_password("password", "pbkdf2_sha256$999999999$AA==$AA==")
    assert not verify_password("password", "pbkdf2_sha256$600000$$")


def test_session_tokens_are_stored_as_one_way_hashes() -> None:
    token = "random-session-token"

    assert hash_session_token(token) == hash_session_token(token)
    assert hash_session_token(token) != token
