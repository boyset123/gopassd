import React, { useState, useEffect } from 'react';
import { Text, StyleSheet } from 'react-native';

const Timer = ({ timeOut, estimatedTimeBack, departureTime, onTimeShort, onTimeOver }: { timeOut?: string, estimatedTimeBack: string, departureTime?: string, onTimeShort?: () => void, onTimeOver?: () => void }) => {
  const calculateRemainingTime = () => {
    if (!timeOut || !estimatedTimeBack || !departureTime) return { hours: 0, minutes: 0, seconds: 0, isOver: true };

    const timeOutDate = new Date();
    const timeOutMatch = timeOut.match(/(\d+):(\d+)\s*(AM|PM)/i);
    if (timeOutMatch) {
      let h = parseInt(timeOutMatch[1], 10);
      const m = parseInt(timeOutMatch[2], 10);
      const ampm = timeOutMatch[3].toUpperCase();
      if (ampm === 'PM' && h < 12) h += 12;
      if (ampm === 'AM' && h === 12) h = 0;
      timeOutDate.setHours(h, m, 0, 0);
    } else {
      return { hours: 0, minutes: 0, seconds: 0, isOver: true };
    }

    const etbDate = new Date();
    const etbMatch = estimatedTimeBack.match(/(\d+):(\d+)\s*(AM|PM)/i);
    if (etbMatch) {
      let h = parseInt(etbMatch[1], 10);
      const m = parseInt(etbMatch[2], 10);
      const ampm = etbMatch[3].toUpperCase();
      if (ampm === 'PM' && h < 12) h += 12;
      if (ampm === 'AM' && h === 12) h = 0;
      etbDate.setHours(h, m, 0, 0);
    } else {
      return { hours: 0, minutes: 0, seconds: 0, isOver: true };
    }

    if (etbDate.getTime() < timeOutDate.getTime()) {
      etbDate.setDate(etbDate.getDate() + 1);
    }

    const totalDuration = etbDate.getTime() - timeOutDate.getTime();
    const departureDate = new Date(departureTime);

    if (isNaN(departureDate.getTime())) {
      return { hours: 0, minutes: 0, seconds: 0, isOver: true };
    }

    const now = new Date();
    const elapsedTime = now.getTime() - departureDate.getTime();
    const diff = totalDuration - elapsedTime;

        const isOver = diff <= 0;
    const absDiff = Math.abs(diff);

    if (isOver) {
      return {
        hours: Math.floor(absDiff / (1000 * 60 * 60)),
        minutes: Math.floor((absDiff / 1000 / 60) % 60),
        seconds: Math.floor((absDiff / 1000) % 60),
        isOver: true,
      };
    }

    return {
      hours: Math.floor(diff / (1000 * 60 * 60)),
      minutes: Math.floor((diff / 1000 / 60) % 60),
      seconds: Math.floor((diff / 1000) % 60),
      isOver: false,
    };
  };

    const [remainingTime, setRemainingTime] = useState(calculateRemainingTime);
    const [notificationSent, setNotificationSent] = useState(false);
  const [overtimeNotificationSent, setOvertimeNotificationSent] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
      const newRemainingTime = calculateRemainingTime();
      setRemainingTime(newRemainingTime);

      if (
        !newRemainingTime.isOver &&
        newRemainingTime.hours === 0 &&
        newRemainingTime.minutes < 5 &&
        !notificationSent
      ) {
                if (onTimeShort) {
          onTimeShort();
        }
        setNotificationSent(true);
      } else if (newRemainingTime.isOver && !overtimeNotificationSent) {
        if (onTimeOver) {
          onTimeOver();
        }
        setOvertimeNotificationSent(true);
      }
    }, 1000);

    return () => clearInterval(interval);
    }, [departureTime, estimatedTimeBack, notificationSent, onTimeShort, onTimeOver, overtimeNotificationSent]);

  const timerStyle = remainingTime.isOver ? [styles.timerText, styles.timerTextOver] : styles.timerText;

  return (
    <Text style={timerStyle}>
      {remainingTime.isOver ? '-' : ''}{String(remainingTime.hours).padStart(2, '0')}:
      {String(remainingTime.minutes).padStart(2, '0')}:
      {String(remainingTime.seconds).padStart(2, '0')}
    </Text>
  );
};

const styles = StyleSheet.create({
  timerText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#28a745', // Green
    marginTop: 10,
  },
  timerTextOver: {
    color: '#dc3545', // Red
  },
});

export default Timer;
