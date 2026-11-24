import { CameraView, useCameraPermissions } from 'expo-camera';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { isActive } from '../../lib/alerts';
import { codeFromScan } from '../../lib/code';
import { useDeliveries } from '../../lib/deliveries';
import { roomOf } from '../../lib/format';
import { Button, Icon } from '../../lib/ui';

const back = () => (router.canGoBack() ? router.back() : router.replace('/'));

/** The camera, at the bed: the guest's delivery QR hands this order over. */
export default function ScanScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { deliverWithCode, orders } = useDeliveries();
  const [permission, requestPermission] = useCameraPermissions();
  const [checking, setChecking] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  // One scan at a time: the camera keeps reporting the same QR while it is in view.
  const busy = useRef(false);
  const order = orders.find((candidate) => candidate.id === id && isActive(candidate));

  // Delivered or taken off them meanwhile: back to the list.
  if (!order) return <Redirect href="/" />;

  const onScan = async (data: string) => {
    if (busy.current) return;
    const code = codeFromScan(data);
    if (!code) {
      setMessage('That isn’t a delivery QR. Scan the one on the guest’s order page.');
      return;
    }
    busy.current = true;
    setChecking(true);
    const failed = await deliverWithCode(order, code);
    setChecking(false);
    if (failed) {
      setMessage(failed);
      // A moment before the next try, so the same QR is not sent again at once.
      setTimeout(() => (busy.current = false), 1500);
      return;
    }
    // Delivered: off this screen and the order's, back to the list.
    if (router.canDismiss()) router.dismissAll();
    else router.replace('/');
  };

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.top}>
        <Text style={styles.title}>Scan the guest’s QR</Text>
        <Text style={styles.subtitle}>
          #{order.orderNumber} · {roomOf(order)}
        </Text>
      </View>

      {!permission ? (
        <ActivityIndicator color="#FFFFFF" size="large" style={{ flex: 1 }} />
      ) : !permission.granted ? (
        <View style={styles.ask}>
          <Icon color="#FFFFFF" name="camera-outline" size={40} />
          <Text style={styles.askText}>The camera reads the QR on the guest’s order page.</Text>
          <Button
            label="Allow the camera"
            onPress={() => void requestPermission()}
            variant="white"
          />
        </View>
      ) : (
        <View style={styles.cameraBox}>
          <CameraView
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            facing="back"
            onBarcodeScanned={({ data }) => void onScan(data)}
            style={StyleSheet.absoluteFill}
          />
          <View pointerEvents="none" style={styles.frame} />
          {checking ? (
            <ActivityIndicator color="#FFFFFF" size="large" style={styles.checking} />
          ) : null}
        </View>
      )}

      <View style={styles.bottom}>
        {message ? (
          <Text accessibilityRole="alert" style={styles.message}>
            {message}
          </Text>
        ) : (
          <Text style={styles.hint}>Point the camera at the QR on the guest’s phone.</Text>
        )}
        <Button label="Type the code instead" onPress={back} size="medium" variant="onBlue" />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  ask: { alignItems: 'center', flex: 1, gap: 16, justifyContent: 'center', padding: 24 },
  askText: { color: '#FFFFFF', fontSize: 16, textAlign: 'center' },
  bottom: { gap: 12, padding: 16 },
  cameraBox: { alignItems: 'center', flex: 1, justifyContent: 'center', overflow: 'hidden' },
  checking: { position: 'absolute' },
  frame: {
    borderColor: '#FFFFFF',
    borderRadius: 24,
    borderWidth: 3,
    height: 250,
    width: 250,
  },
  hint: { color: 'rgba(255,255,255,0.85)', fontSize: 15, textAlign: 'center' },
  message: {
    backgroundColor: '#FDE8EB',
    borderRadius: 12,
    color: '#B42339',
    fontSize: 14,
    padding: 10,
    textAlign: 'center',
  },
  screen: { backgroundColor: '#0E1A2B', flex: 1 },
  subtitle: { color: 'rgba(255,255,255,0.8)', fontSize: 15 },
  title: { color: '#FFFFFF', fontSize: 22, fontWeight: '800' },
  top: { gap: 4, padding: 16 },
});
