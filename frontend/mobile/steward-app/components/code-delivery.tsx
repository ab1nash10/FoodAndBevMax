// A phone order's Delivered: the guest's QR, scanned (or its six digits typed) at the bed.
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { useDeliveries } from '../lib/deliveries';
import type { Delivery } from '../lib/types';
import { Button, colors } from '../lib/ui';

export function CodeDelivery({ onDone, order }: { onDone?: () => void; order: Delivery }) {
  const { deliverWithCode } = useDeliveries();
  const [typing, setTyping] = useState(false);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!typing) {
    return (
      <View style={{ gap: 8 }}>
        <Button
          icon="qr-code-outline"
          label="Scan guest’s QR"
          onPress={() => router.push({ params: { id: order.id }, pathname: '/scan/[id]' })}
        />
        <Button
          label="Type the code"
          onPress={() => setTyping(true)}
          size="medium"
          variant="outline"
        />
      </View>
    );
  }

  return (
    <View style={{ gap: 8 }}>
      <Text nativeID={`code-${order.id}`} style={styles.label}>
        Guest’s 6-digit code
      </Text>
      <TextInput
        accessibilityLabelledBy={`code-${order.id}`}
        autoFocus
        inputMode="numeric"
        maxLength={6}
        onChangeText={(text) => setCode(text.replace(/\D/g, ''))}
        style={styles.input}
        value={code}
      />
      <Text style={styles.hint}>Under the QR on the guest’s order page; they can read it out.</Text>
      {error ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      ) : null}
      <Button
        busy={busy}
        disabled={code.length !== 6}
        icon="checkmark"
        label="Confirm delivery"
        onPress={async () => {
          setBusy(true);
          setError(null);
          const failed = await deliverWithCode(order, code);
          setBusy(false);
          if (failed) setError(failed);
          else onDone?.();
        }}
      />
      <Button
        disabled={busy}
        label="Cancel"
        onPress={() => {
          setTyping(false);
          setCode('');
          setError(null);
        }}
        size="medium"
        variant="ghost"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  error: {
    backgroundColor: colors.badSoft,
    borderRadius: 12,
    color: colors.bad,
    fontSize: 14,
    padding: 10,
  },
  hint: { color: colors.muted, fontSize: 13 },
  input: {
    backgroundColor: colors.surface,
    borderColor: colors.primaryBorder,
    borderRadius: 14,
    borderWidth: 1,
    color: colors.text,
    fontSize: 26,
    fontWeight: '700',
    height: 56,
    letterSpacing: 10,
    textAlign: 'center',
  },
  label: { color: colors.muted, fontSize: 13, fontWeight: '700' },
});
