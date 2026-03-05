import { CameraView, useCameraPermissions } from "expo-camera";
import * as ImagePicker from "expo-image-picker";
import { useState } from "react";
import { Button, Text, View } from "react-native";

export default function ScanPage() {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [image, setImage] = useState<string | null>(null);

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

  const uploadReceipt = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 1,
    });

    if (!result.canceled) {
      setImage(result.assets[0].uri);
      alert("Receipt uploaded!");
      console.log(result.assets[0].uri);
    }
  };

  return (
    <View style={{ flex: 1 }}>
      
      <CameraView
        style={{ flex: 1 }}
        barcodeScannerSettings={{
          barcodeTypes: ["qr"],
        }}
        onBarcodeScanned={
          scanned
            ? undefined
            : ({ data }) => {
                setScanned(true);
                alert(`Scanned: ${data}`);
              }
        }
      />

      {/* Button overlay */}
      <View
        style={{
          position: "absolute",
          bottom: 50,
          alignSelf: "center"
        }}
      >
        <Button title="Upload Receipt" onPress={uploadReceipt} />
      </View>

    </View>
  );
}