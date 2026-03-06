import React from "react";
import { StyleSheet, Text, View } from "react-native";
import Svg, { Circle } from "react-native-svg";

interface Props {
  percentage: number;
  size?: number;
  strokeWidth?: number;
  color?: string;
}

export default function CategoryDonut({
  percentage,
  size = 90,
  strokeWidth = 10,
  color = "#4C8DAE",
}: Props) {

  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  const strokeDashoffset =
    circumference - (percentage / 100) * circumference;

  return (
    <View style={{ width: size, height: size }}>

      <Svg width={size} height={size}>

        <Circle
          stroke="#E0E0E0"
          fill="none"
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={strokeWidth}
        />

        <Circle
          stroke={color}
          fill="none"
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          rotation="-90"
          origin={`${size / 2}, ${size / 2}`}
        />

      </Svg>

      <View style={styles.center}>
        <Text style={styles.text}>{Math.round(percentage)}%</Text>
      </View>

    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    position: "absolute",
    top: "38%",
    left: 0,
    right: 0,
    alignItems: "center",
  },
  text: {
    fontSize: 16,
    fontWeight: "600",
  },
});