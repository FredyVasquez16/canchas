/**
 * S38: a Google account starts without a phone. The venue needs that phone to reach the
 * client, so the client screens send the account to the profile form until it is there.
 */
export function needsPhoneCompletion(user: { phone: string } | null | undefined): boolean {
  if (!user) {
    return false;
  }
  return user.phone.trim() === '';
}
