import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { Button, TextInput, View } from "react-native";

export default function OTP() {

  const { email, name, password } = useLocalSearchParams();

  const router = useRouter();
  const [otp, setOtp] = useState("");

  const verifyOTP = async () => {

    const res = await fetch(
      `${process.env.EXPO_PUBLIC_API_URL}/api/v1/auth/verify-otp`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          email,
          otp,
          name,
          password
        })
      }
    );

    if (res.ok) {
      router.replace("/loginpage");
    } else {
      alert("Invalid OTP");
    }
  };

  return (
    <View>
      <TextInput
        placeholder="Enter OTP"
        value={otp}
        onChangeText={setOtp}
      />
      <Button title="Verify OTP" onPress={verifyOTP} />
    </View>
  );
}