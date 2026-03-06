export async function loginWithGoogle(idToken: string | undefined) {
  if (!idToken) return;

  const res = await fetch("http://localhost:3000/auth/google", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      token: idToken,
    }),
  });

  const data = await res.json();

  console.log("Backend response:", data);

  return data;
}