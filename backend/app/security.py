import base64
import binascii
import hashlib
import hmac
import secrets


MVP_USERNAME = "user"
MVP_PASSWORD = "password"
PASSWORD_HASH_ITERATIONS = 600_000


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        salt,
        PASSWORD_HASH_ITERATIONS,
    )
    salt_text = base64.urlsafe_b64encode(salt).decode("ascii")
    digest_text = base64.urlsafe_b64encode(digest).decode("ascii")
    return f"pbkdf2_sha256${PASSWORD_HASH_ITERATIONS}${salt_text}${digest_text}"


def verify_password(password: str, encoded_hash: str) -> bool:
    try:
        algorithm, iterations_text, salt_text, expected_text = encoded_hash.split("$")
        iterations = int(iterations_text)
        salt = base64.urlsafe_b64decode(salt_text.encode("ascii"))
        expected = base64.urlsafe_b64decode(expected_text.encode("ascii"))
    except (ValueError, UnicodeEncodeError, binascii.Error):
        return False

    if algorithm != "pbkdf2_sha256" or not 1 <= iterations <= 2_000_000:
        return False
    if len(salt) != 16 or len(expected) != 32:
        return False

    actual = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        salt,
        iterations,
    )
    return hmac.compare_digest(actual, expected)


def hash_session_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()
