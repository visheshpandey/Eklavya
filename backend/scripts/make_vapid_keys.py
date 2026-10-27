"""Create the key pair for push notifications (run once, then put both values in the backend environment).

    python scripts/make_vapid_keys.py

Keep VAPID_PRIVATE_KEY secret. Changing the keys later means every device has to allow notifications again.
"""
from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat
from py_vapid import Vapid01, b64urlencode

vapid = Vapid01()
vapid.generate_keys()
public = vapid.public_key.public_bytes(Encoding.X962, PublicFormat.UncompressedPoint)
private = vapid.private_key.private_numbers().private_value.to_bytes(32, "big")
print(f"VAPID_PUBLIC_KEY={b64urlencode(public)}")
print(f"VAPID_PRIVATE_KEY={b64urlencode(private)}")
