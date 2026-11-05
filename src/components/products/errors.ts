/** The backend's sentence when it gave one. */
export const errorText = (error: unknown, fallback = "Could not save. Try again.") => {
  const data = (error as { response?: { data?: { ex?: string; message?: string; detail?: string } } })
    ?.response?.data;
  return data?.ex || data?.message || data?.detail || fallback;
};
