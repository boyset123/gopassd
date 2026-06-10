import React, { useState, useEffect } from 'react';
import { Text, StyleSheet } from 'react-native';
import { useServerTime } from '../hooks/useServerTime';
import { computePassSlipRemaining } from '../utils/passSlipTimer';

const Timer = ({ estimatedTimeBack, departureTime, onTimeShort, onTimeOver }: { timeOut?: string, estimatedTimeBack: string, departureTime?: string, onTimeShort?: () => void, onTimeOver?: () => void }) => {
  const { getServerNow } = useServerTime();

  const calculateRemainingTime = () => {
    if (!estimatedTimeBack || !departureTime) {
      return { hours: 0, minutes: 0, seconds: 0, isOverdue: true };
    }
    return computePassSlipRemaining(departureTime, estimatedTimeBack, getServerNow().getTime());
  };

  const [remainingTime, setRemainingTime] = useState(calculateRemainingTime);
  const [notificationSent, setNotificationSent] = useState(false);
  const [overtimeNotificationSent, setOvertimeNotificationSent] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
      const newRemainingTime = calculateRemainingTime();
      setRemainingTime(newRemainingTime);

      if (
        !newRemainingTime.isOverdue &&
        newRemainingTime.hours === 0 &&
        newRemainingTime.minutes < 5 &&
        !notificationSent
      ) {
        if (onTimeShort) onTimeShort();
        setNotificationSent(true);
      } else if (newRemainingTime.isOverdue && !overtimeNotificationSent) {
        if (onTimeOver) onTimeOver();
        setOvertimeNotificationSent(true);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [departureTime, estimatedTimeBack, notificationSent, onTimeShort, onTimeOver, overtimeNotificationSent, getServerNow]);

  const timerStyle = remainingTime.isOverdue ? [styles.timerText, styles.timerTextOver] : styles.timerText;

  return (
    <Text style={timerStyle}>
      {remainingTime.isOverdue ? '-' : ''}{String(remainingTime.hours).padStart(2, '0')}:
      {String(remainingTime.minutes).padStart(2, '0')}:
      {String(remainingTime.seconds).padStart(2, '0')}
    </Text>
  );
};

const styles = StyleSheet.create({
  timerText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#28a745',
    marginTop: 10,
  },
  timerTextOver: {
    color: '#dc3545',
  },
});

export default Timer;
