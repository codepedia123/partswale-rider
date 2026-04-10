import { ApiError } from "./api";

export function isAuthError(error: unknown) {
  return error instanceof ApiError && error.auth;
}

export function getErrorMessage(error: unknown) {
  if (error instanceof ApiError) {
    switch (error.reason) {
      case "not_registered":
        return "Yeh number registered nahi hai";
      case "invalid_otp":
        return "OTP galat hai ya expire ho gaya";
      case "out_of_geofence":
        return "Aap sahi jagah par nahi hain";
      case "photo_too_old":
        return "Photo purani ho gayi. Dobara try karein";
      case "order_taken":
        return "Yeh order kisi aur rider ne le liya";
      default:
        return error.message || "Kuch gadbad hui, thodi der mein try karein";
    }
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "Kuch gadbad hui, thodi der mein try karein";
}
