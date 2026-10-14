// Backend ApiPatterns at dev a5133b24. These format checks do not replace service validation.
export const apiPatterns = {
  phone: /^\+?[1-9]\d{7,14}$/,
  timezone: /^[A-Za-z_]+\/[A-Za-z_]+(?:\/[A-Za-z_]+)?$/,
  microchip: /^[A-Z0-9-]{9,15}$/,
  passport: /^[A-Z0-9-]{5,20}$/,
};
