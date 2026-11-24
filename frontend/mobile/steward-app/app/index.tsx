import { Link, Redirect } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { CodeDelivery } from '../components/code-delivery';
import { Instructions, Items, useNow } from '../components/order-parts';
import { isActive } from '../lib/alerts';
import { signOut } from '../lib/api';
import { useDeliveries } from '../lib/deliveries';
import { agoText, itemCount, minutesSince, roomOf } from '../lib/format';
import { useSession } from '../lib/session';
import type { Delivery } from '../lib/types';
import { Button, colors, Icon, Pill, Screen, styles as ui } from '../lib/ui';

function ReadyCard({ now, order }: { now: number; order: Delivery }) {
  const { markDelivered } = useDeliveries();
  const waited = minutesSince(order.readyAt, now);

  return (
    <View style={ui.card}>
      <View style={styles.row}>
        <Link
          accessibilityLabel={`Open order #${order.orderNumber}`}
          href={{ params: { id: order.id }, pathname: '/order/[id]' }}
          style={styles.number}
        >
          #{order.orderNumber}
        </Link>
        {/* Waiting a while: amber, so the oldest is taken first. */}
        <Pill tone={waited >= 5 ? 'pending' : 'ok'}>
          <Icon color={waited >= 5 ? colors.pending : colors.ok} name="time-outline" size={14} />
          <Text style={[ui.pillText, { color: waited >= 5 ? colors.pending : colors.ok }]}>
            {agoText('Ready', order.readyAt, now)}
          </Text>
        </Pill>
      </View>
      <View style={styles.room}>
        <Icon color={colors.link} name="bed-outline" size={22} />
        <Text style={styles.roomText}>{roomOf(order)}</Text>
      </View>
      <View style={styles.room}>
        <Icon color={colors.muted} name="restaurant-outline" size={16} />
        <Text style={ui.muted}>{`Pick up at ${order.restaurantName}`}</Text>
      </View>
      <View style={styles.divider} />
      <Items order={order} />
      {order.instructions ? <Instructions text={order.instructions} /> : null}
      {/* A phone order is handed over with the guest's QR; one from the till with a tap. */}
      {order.needsCode ? (
        <CodeDelivery order={order} />
      ) : (
        <Button icon="checkmark" label="Delivered" onPress={() => markDelivered(order)} />
      )}
    </View>
  );
}

function Section({ count, title }: { count: number; title: string }) {
  return (
    <View style={[styles.row, { paddingHorizontal: 4 }]}>
      <Text accessibilityRole="header" style={styles.section}>
        {title}
      </Text>
      <View style={styles.count}>
        <Text style={styles.countText}>{count}</Text>
      </View>
    </View>
  );
}

export default function MyDeliveriesScreen() {
  const current = useSession();

  if (current.status !== 'signedIn') return <Redirect href="/sign-in" />;
  if (!current.permissions.includes('ORDER_DELIVER')) {
    return (
      <Screen subtitle={current.name} title="My deliveries">
        <View style={{ gap: 16, padding: 20 }}>
          <Text style={styles.empty}>This app is for delivery staff</Text>
          <Text style={ui.muted}>
            Your account is not a Delivery Operator. Ask your admin, or sign in with a delivery
            account.
          </Text>
          <Button label="Sign out" onPress={() => void signOut()} variant="outline" />
        </View>
      </Screen>
    );
  }

  return <DeliveriesList name={current.name} />;
}

function DeliveriesList({ name }: { name: string | null }) {
  const { error, held, loading, orders } = useDeliveries();
  const now = useNow();
  const [pulling, setPulling] = useState(false);
  const active = orders.filter((order) => isActive(order) && order.id !== held?.id);
  const ready = active.filter((order) => order.status === 'READY');
  const coming = active.filter((order) => order.status !== 'READY');
  const deliveredToday = orders.filter((order) => order.status === 'COLLECTED').length;

  return (
    <Screen subtitle={name} title="My deliveries">
      <ScrollView
        contentContainerStyle={[styles.page, held && { paddingBottom: 96 }]}
        refreshControl={
          // The list is checked every few seconds; a pull just shows it is current.
          <RefreshControl
            colors={[colors.primary]}
            onRefresh={() => {
              setPulling(true);
              setTimeout(() => setPulling(false), 600);
            }}
            refreshing={pulling}
          />
        }
      >
        {error ? (
          <View style={styles.error}>
            <Icon color={colors.bad} name="cloud-offline-outline" size={18} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}
        {loading ? (
          <ActivityIndicator color={colors.primary} size="large" style={{ marginTop: 40 }} />
        ) : ready.length + coming.length === 0 ? (
          <View style={[ui.card, { alignItems: 'center', paddingVertical: 32 }]}>
            <Icon color={colors.primary} name="notifications-outline" size={34} />
            <Text style={styles.empty}>No deliveries for you right now</Text>
            <Text style={[ui.muted, { textAlign: 'center' }]}>
              When a cashier or the kitchen gives you a room order, this phone rings.
            </Text>
          </View>
        ) : null}

        {ready.length ? (
          <View style={{ gap: 10 }}>
            <Section count={ready.length} title="Ready to take" />
            {ready.map((order) => (
              <ReadyCard key={order.id} now={now} order={order} />
            ))}
          </View>
        ) : null}

        {coming.length ? (
          <View style={{ gap: 10 }}>
            <Section count={coming.length} title="Being made" />
            {coming.map((order) => (
              <Link
                asChild
                href={{ params: { id: order.id }, pathname: '/order/[id]' }}
                key={order.id}
              >
                <Pressable
                  accessibilityLabel={`Open order #${order.orderNumber}`}
                  style={styles.coming}
                >
                  <Text style={styles.comingNumber}>#{order.orderNumber}</Text>
                  <Text style={styles.comingRoom}>{roomOf(order)}</Text>
                  <Text style={[ui.muted, { marginLeft: 'auto' }]}>{itemCount(order)}</Text>
                </Pressable>
              </Link>
            ))}
          </View>
        ) : null}

        <Link asChild href="/done">
          <Pressable accessibilityRole="link" style={styles.doneLink}>
            <Text style={styles.doneText}>Delivered today</Text>
            <Text style={[styles.doneText, { color: colors.ok }]}>{deliveredToday}</Text>
          </Pressable>
        </Link>
        <Button label="Sign out" onPress={() => void signOut()} size="medium" variant="ghost" />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  coming: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.primaryBorder,
    borderRadius: 16,
    borderStyle: 'dashed',
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    minHeight: 52,
    paddingHorizontal: 14,
  },
  comingNumber: { color: colors.text, fontSize: 16, fontWeight: '800' },
  comingRoom: { color: colors.text, fontSize: 15 },
  count: {
    alignItems: 'center',
    backgroundColor: colors.border,
    borderRadius: 999,
    minWidth: 26,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  countText: { color: colors.muted, fontSize: 13, fontWeight: '700' },
  divider: { backgroundColor: colors.border, height: 1 },
  doneLink: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
    minHeight: 52,
    paddingHorizontal: 16,
  },
  doneText: { color: colors.text, fontSize: 15, fontWeight: '700' },
  empty: { color: colors.text, fontSize: 17, fontWeight: '700', textAlign: 'center' },
  error: {
    alignItems: 'center',
    backgroundColor: colors.badSoft,
    borderRadius: 14,
    flexDirection: 'row',
    gap: 8,
    padding: 12,
  },
  errorText: { color: colors.bad, flex: 1, fontSize: 14 },
  number: { color: colors.text, fontSize: 28, fontWeight: '800', letterSpacing: -0.5 },
  page: { gap: 16, padding: 14 },
  room: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  roomText: { color: colors.link, flex: 1, fontSize: 21, fontWeight: '800' },
  row: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  section: { color: colors.text, fontSize: 16, fontWeight: '800' },
});
