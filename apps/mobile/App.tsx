import { useRef, useState } from "react";
import { SafeAreaView, TextInput, Button, Text } from "react-native";
import { computeLieScore } from "@sns/core";

export default function App() {
  const [text, setText] = useState("");
  const times = useRef<number[]>([]);
  const [score, setScore] = useState<number | null>(null);

  const onKeyPress = () => {
    const now = global.performance.now();
    const arr = times.current;
    if (arr.length > 0) arr.push(now - arr[arr.length - 1]);
    else arr.push(now);
  };

  const onSubmit = () => {
    const ks = times.current.slice(1);
    setScore(computeLieScore({ text, keystrokes: ks }));
  };

  return (
    <SafeAreaView style={{ padding: 16 }}>
      <TextInput
        value={text}
        onChangeText={setText}
        onKeyPress={onKeyPress}
        multiline
        placeholder="つぶやきを書く"
        style={{ borderWidth: 1, borderRadius: 12, padding: 12, height: 140 }}
      />
      <Button title="投稿してスコア化" onPress={onSubmit} />
      {score != null && (
        <Text style={{ marginTop: 12, fontSize: 18 }}>
          嘘っぽさスコア: {(score * 100).toFixed(1)}%
        </Text>
      )}
    </SafeAreaView>
  );
}
