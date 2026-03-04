import { CameraView, useCameraPermissions } from "expo-camera";
import { useState } from "react";
import { Button, Text, View } from "react-native";

export default function ScanPage() {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);

  if (!permission) {
    return <View />;
  }

  if (!permission.granted) {
    return (
      <View>
        <Text>We need camera permission</Text>
        <Button title="Grant Permission" onPress={requestPermission} />
      </View>
    );
  }

  return (
    <CameraView
      style={{ flex: 1 }}
      barcodeScannerSettings={{
        barcodeTypes: ["qr"],
      }}
      onBarcodeScanned={({ data }) => {
        setScanned(true);
        alert(`Scanned: ${data}`);
      }}
    />
  );
}