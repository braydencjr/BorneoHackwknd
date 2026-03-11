import React from "react";
import { StyleSheet, Text, View } from "react-native";
import Svg, { Circle } from "react-native-svg";

interface Props {
  income: number;
  outcome: number;
  size?: number;
  strokeWidth?: number;
}

export default function DonutProgress({
  income,
  outcome,
  size = 140,
  strokeWidth = 15,
}: Props) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  const incomeLength = (income / 100) * circumference;
  const outcomeLength = (outcome / 100) * circumference;

  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size}>
        {/* Background */}
        <Circle
          stroke="#E0E0E0"
          fill="none"
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={strokeWidth}
        />

        {/* Outcome (red) */}
        <Circle
          stroke="#EF4444"
          fill="none"
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={strokeWidth}
          strokeDasharray={`${outcomeLength} ${circumference}`}
          rotation="-90"
          origin={`${size / 2}, ${size / 2}`}
        />

        {/* Income (green) */}
        <Circle
          stroke="#22C55E"
          fill="none"
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={strokeWidth}
          strokeDasharray={`${incomeLength} ${circumference}`}
          rotation={outcome * 3.6 - 90}
          origin={`${size / 2}, ${size / 2}`}
        />
      </Svg>

      {/* Center text */}
      <View style={styles.center}>
        <Text style={styles.text}>
          {Math.round(income)}% | {Math.round(outcome)}%
        </Text>

        <Text style={styles.subText}>Income | Expenses</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    position: "absolute",
    top: "35%",
    left: 0,
    right: 0,
    alignItems: "center",
  },
  text: {
    fontSize: 20,
    fontWeight: "600",
  },

  subText: {
    fontSize: 10,
    color: "#666",
    marginTop: 2,
  },
});
