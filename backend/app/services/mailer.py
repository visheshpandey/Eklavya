"""Outgoing email over SMTP (Gmail works with an app password). Off until SMTP_USER and SMTP_PASSWORD are set."""
import logging
import smtplib
import ssl
from email.message import EmailMessage

from app.config import settings

log = logging.getLogger(__name__)
TIMEOUT_SECONDS = 20


def enabled() -> bool:
    return bool(settings.smtp_user and settings.smtp_password)


def send(to: str, subject: str, text: str) -> bool:
    """Send one plain-text email. Returns False (and logs) instead of raising, so a mail problem never breaks a request."""
    if not enabled():
        return False
    message = EmailMessage()
    message["From"] = settings.smtp_from or f"Eklavya <{settings.smtp_user}>"
    message["To"] = to
    message["Subject"] = subject
    message.set_content(text)
    try:
        if settings.smtp_port == 465:
            with smtplib.SMTP_SSL(settings.smtp_host, settings.smtp_port, context=ssl.create_default_context(), timeout=TIMEOUT_SECONDS) as smtp:
                smtp.login(settings.smtp_user, settings.smtp_password)
                smtp.send_message(message)
        else:
            with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=TIMEOUT_SECONDS) as smtp:
                smtp.starttls(context=ssl.create_default_context())
                smtp.login(settings.smtp_user, settings.smtp_password)
                smtp.send_message(message)
        return True
    except (OSError, smtplib.SMTPException) as exc:
        log.warning("Email to %s failed: %s", to, exc)
        return False
