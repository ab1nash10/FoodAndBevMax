// The full-screen alert that rings: a new order given to the steward, or one turned ready.
import { router } from 'expo-router';
import { Modal, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useDeliveries } from '../lib/deliveries';
import { itemCount, roomOf } from '../lib/format';
import { Button, Icon } from '../lib/ui';

export function AlertOverlay() {
  const { alerts, dismissAlerts } = useDeliveries();
  const latest = alerts[alerts.length - 1];

  if (!latest) return null;
  const { kind, order } = latest;

  return (
    <Modal animationType="fade" onRequestClose={dismissAlerts} statusBarTranslucent visible>
      <SafeAreaView style={styles.screen}>
        <View style={styles.bell}>
          <View style={styles.bellInner}>
            <Icon color="#0B57A4" name="notifications" size={38} />
          </View>
        </View>
        <View accessibilityRole="alert" style={{ alignItems: 'center', gap: 8 }}>
          <Text style={styles.kind}>
            {kind === 'new' ? 'New delivery for you' : 'Ready to take'}
          </Text>
          <Text
            adjustsFontSizeToFit
            numberOfLines={2}
            // Big enough to read across a corridor; a long room name steps down to fit.
            style={[styles.room, { fontSize: roomOf(order).length > 14 ? 32 : 38 }]}
          >
            {roomOf(order)}
          </Text>
          <Text style={styles.order}>
            Order #{order.orderNumber} · {itemCount(order)}
          </Text>
        </View>
        <View style={styles.box}>
          <View style={styles.line}>
            <Icon color="#FFFFFF" name="restaurant-outline" size={20} />
            <Text style={styles.lineText}>
              Pick up at <Text style={{ fontWeight: '700' }}>{order.restaurantName}</Text>
            </Text>
          </View>
          <View style={styles.line}>
            <Icon color="#FFFFFF" name="time-outline" size={20} />
            <Text style={styles.lineText}>
              {kind === 'new' ? 'Being made · it rings again when it’s ready' : 'Ready now'}
            </Text>
          </View>
        </View>
        {alerts.length > 1 ? <Text style={styles.more}>and {alerts.length - 1} more</Text> : null}
        <Text style={styles.more}>Rings until you tap</Text>
        <View style={{ alignSelf: 'stretch', gap: 10, marginTop: 'auto' }}>
          <Button label="Got it" onPress={dismissAlerts} variant="white" />
          <Button
            label="Open the order"
            onPress={() => {
              dismissAlerts();
              router.push({ params: { id: order.id }, pathname: '/order/[id]' });
            }}
            size="medium"
            variant="onBlue"
          />
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  bell: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 999,
    height: 112,
    justifyContent: 'center',
    width: 112,
  },
  bellInner: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 999,
    height: 80,
    justifyContent: 'center',
    width: 80,
  },
  box: {
    alignSelf: 'stretch',
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderColor: 'rgba(255,255,255,0.2)',
    borderRadius: 20,
    borderWidth: 1,
    gap: 12,
    padding: 16,
  },
  kind: { color: 'rgba(255,255,255,0.85)', fontSize: 16, fontWeight: '600' },
  line: { alignItems: 'center', flexDirection: 'row', gap: 10 },
  lineText: { color: '#FFFFFF', flex: 1, fontSize: 15 },
  more: { color: 'rgba(255,255,255,0.8)', fontSize: 14 },
  order: { color: 'rgba(255,255,255,0.92)', fontSize: 17 },
  room: {
    color: '#FFFFFF',
    fontSize: 38,
    fontWeight: '800',
    letterSpacing: -1,
    textAlign: 'center',
  },
  screen: {
    alignItems: 'center',
    backgroundColor: '#0B57A4',
    flex: 1,
    gap: 26,
    paddingBottom: 24,
    paddingHorizontal: 24,
    paddingTop: 56,
  },
});
