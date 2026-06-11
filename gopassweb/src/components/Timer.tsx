import React, { useState, useEffect } from 'react';
import { Text, StyleSheet, View } from 'react-native';
import { useServerTime } from '../hooks/useServerTime';
import { computePassSlipRemaining } from '../utils/passSlipTimer';

interface TimerProps {
  timeOut?: string;
  estimatedTimeBack: string;
  departureTime: string;
  pill?: boolean;
}

const Timer = ({ estimatedTimeBack, departureTime, pill }: TimerProps) => {
  const { getServerNow } = useServerTime();

  const calculateRemainingTime = () => {
    if (!estimatedTimeBack || !departureTime) {
      return { hours: 0, minutes: 0, seconds: 0, isOverdue: true };
    }
    return computePassSlipRemaining(departureTime, estimatedTimeBack, getServerNow().getTime());
  };

  const [remainingTime, setRemainingTime] = useState(calculateRemainingTime);

  useEffect(() => {
    const interval = setInterval(() => {
      setRemainingTime(calculateRemainingTime());
    }, 1000);

    return () => clearInterval(interval);
  }, [departureTime, estimatedTimeBack, getServerNow]);

  const timerStyle = remainingTime.isOverdue ? styles.overdueText : styles.timerText;
  const label = `${remainingTime.isOverdue ? '-' : ''}${String(remainingTime.hours).padStart(2, '0')}:${String(remainingTime.minutes).padStart(2, '0')}:${String(remainingTime.seconds).padStart(2, '0')}`;

  if (pill) {
    return (
      <View style={[styles.pill, remainingTime.isOverdue ? styles.pillOverdue : styles.pillActive]}>
        <Text style={timerStyle}>{label}</Text>
      </View>
    );
  }

  return <Text style={timerStyle}>{label}</Text>;
};

const styles = StyleSheet.create({
  timerText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#067647',
    fontVariant: ['tabular-nums'],
  },
  overdueText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#B42318',
    fontVariant: ['tabular-nums'],
  },
  pill: {
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
    minWidth: 96,
    alignItems: 'center',
    borderWidth: 1,
  },
  pillActive: {
    backgroundColor: '#ECFDF3',
    borderColor: '#ABEFC6',
  },
  pillOverdue: {
    backgroundColor: '#FEF3F2',
    borderColor: '#FECDCA',
  },
});

export default Timer;
