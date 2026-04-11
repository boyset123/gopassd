import React, { useState, useEffect } from 'react';
import { Text, StyleSheet } from 'react-native';

const Timer = ({ timeOut, estimatedTimeBack, departureTime }: { timeOut: string, estimatedTimeBack: string, departureTime: string }) => {
  const calculateRemainingTime = () => {
    if (!timeOut || !estimatedTimeBack || !departureTime) {
      return { hours: 0, minutes: 0, seconds: 0, isOverdue: true };
    }

    const departureDate = new Date(departureTime);
    if (isNaN(departureDate.getTime())) {
      return { hours: 0, minutes: 0, seconds: 0, isOverdue: true };
    }

    const parseTime = (timeStr: string) => {
      const match = timeStr.match(/(\d+):(\d+)\s*(AM|PM)/i);
      if (!match) return null;

      let hours = parseInt(match[1], 10);
      const minutes = parseInt(match[2], 10);
      const ampm = match[3].toUpperCase();

      if (ampm === 'PM' && hours < 12) hours += 12;
      if (ampm === 'AM' && hours === 12) hours = 0;

      return { hours, minutes };
    };

    const timeOutParts = parseTime(timeOut);
    const etbParts = parseTime(estimatedTimeBack);

    if (!timeOutParts || !etbParts) {
      return { hours: 0, minutes: 0, seconds: 0, isOverdue: true };
    }

    const timeOutDate = new Date(departureDate.getTime());
    timeOutDate.setHours(timeOutParts.hours, timeOutParts.minutes, 0, 0);

    const etbDate = new Date(departureDate.getTime());
    etbDate.setHours(etbParts.hours, etbParts.minutes, 0, 0);

    if (etbDate.getTime() < timeOutDate.getTime()) {
      etbDate.setDate(etbDate.getDate() + 1);
    }

    const totalDuration = etbDate.getTime() - timeOutDate.getTime();
    const now = new Date();
    const elapsedTime = now.getTime() - departureDate.getTime();
    const diff = totalDuration - elapsedTime;

    const isOverdue = diff <= 0;
    const absDiff = Math.abs(diff);

    return {
      hours: Math.floor(absDiff / (1000 * 60 * 60)),
      minutes: Math.floor((absDiff / 1000 / 60) % 60),
      seconds: Math.floor((absDiff / 1000) % 60),
      isOverdue: isOverdue,
    };
  };

  const [remainingTime, setRemainingTime] = useState(calculateRemainingTime);

  useEffect(() => {
    const interval = setInterval(() => {
      setRemainingTime(calculateRemainingTime());
    }, 1000);

    return () => clearInterval(interval);
  }, [departureTime, estimatedTimeBack]);

  const timerStyle = remainingTime.isOverdue ? styles.overdueText : styles.timerText;

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
    fontSize: 14,
    fontWeight: 'bold',
    color: '#28a745', // Green for active countdown
  },
  overdueText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#dc3545', // Red for overdue
  },
});

export default Timer;
