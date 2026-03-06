import { CameraView, useCameraPermissions } from "expo-camera";
import * as FileSystem from "expo-file-system/legacy";
import * as ImagePicker from "expo-image-picker";
import { useState } from "react";
import { Button, Modal, Text, View } from "react-native";

export default function ScanPage() {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);

  const [category, setCategory] = useState("");
  const [total, setTotal] = useState(0);
  const [showDialog, setShowDialog] = useState(false);

  if (!permission) return <View />;

  if (!permission.granted) {
    return (
      <View>
        <Text>We need camera permission</Text>
        <Button title="Grant Permission" onPress={requestPermission} />
      </View>
    );
  }

  const processReceipt = async (text: string, uri: string) => {
    try {
      const response = await fetch("http://10.0.2.2:8000/api/v1/transactions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          merchant_name: "Receipt",
          receipt_image: uri,
          text: text
        }),
      });

      const data = await response.json();
      console.log("Backend response:", data);

      setCategory(data.category);
      setTotal(data.amount);
      setShowDialog(true);

    } catch (err) {
      console.log("Backend processing failed", err);
    }
  };

  const uploadReceipt = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
  mediaTypes: ["images"],
  quality: 0.6,
});

    if (result.canceled) return;

    const uri = result.assets[0].uri;

    const base64 = await FileSystem.readAsStringAsync(uri, {
      encoding: "base64",
    });

    const apiKey = process.env.EXPO_PUBLIC_VISION_API_KEY;

    try {
      const response = await fetch(
        `https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            requests: [
              {
                image: { content: base64 },
                features: [{ type: "DOCUMENT_TEXT_DETECTION" }],
              },
            ],
          }),
        }
      );

      const data = await response.json();
      console.log("OCR Response:", data);

      const text =
        data.responses?.[0]?.fullTextAnnotation?.text || "No text detected";

      await processReceipt(text, uri);

    } catch (err) {
      console.log(err);
      alert("OCR failed");
    }
  };

  return (
    <View style={{ flex: 1 }}>
      <CameraView
        style={{ flex: 1 }}
        barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
        onBarcodeScanned={
          scanned
            ? undefined
            : ({ data }) => {
                setScanned(true);
                alert(`Scanned: ${data}`);
              }
        }
      />

      <View
        style={{
          position: "absolute",
          bottom: 50,
          alignSelf: "center",
        }}
      >
        <Button title="Upload Receipt" onPress={uploadReceipt} />
      </View>

      {/* Popup dialog */}
      <Modal visible={showDialog} transparent animationType="slide">
        <View
          style={{
            flex: 1,
            justifyContent: "center",
            alignItems: "center",
            backgroundColor: "rgba(0,0,0,0.5)",
          }}
        >
          <View
            style={{
              width: "80%",
              backgroundColor: "white",
              padding: 20,
              borderRadius: 10,
            }}
          >
            <Text style={{ fontWeight: "bold", fontSize: 18 }}>
              Receipt Summary
            </Text>

            <Text style={{ marginTop: 10 }}>
              Category: {category}
            </Text>

            <Text style={{ marginTop: 10, fontWeight: "bold" }}>
              Total: ${Number(total || 0).toFixed(2)}
            </Text>

            <Button title="Close" onPress={() => setShowDialog(false)} />
          </View>
        </View>
      </Modal>
    </View>
  );
}