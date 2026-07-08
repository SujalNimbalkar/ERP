"use client";

import { getLocalRecordsByType } from "./localStore";

export interface DriverRecord {
  driverId: string;
  firstName: string;
  middleName?: string;
  surname: string;
  mobileNumber: string;
  aadharNumber: string;
  accountNumber: string;
  totalSalary: string;
}

export interface DriverOption {
  value: string;
  label: string;
  name: string;
  totalSalary: string;
}

export function buildDriverName(driver: Pick<DriverRecord, "firstName" | "middleName" | "surname">): string {
  return [driver.firstName, driver.middleName, driver.surname]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(" ");
}

export function getDriverRecords(): DriverRecord[] {
  return getLocalRecordsByType("drivers")
    .map((record) => {
      const data = record.data;
      return {
        driverId: String(data.driverId ?? ""),
        firstName: String(data.firstName ?? ""),
        middleName: String(data.middleName ?? ""),
        surname: String(data.surname ?? ""),
        mobileNumber: String(data.mobileNumber ?? ""),
        aadharNumber: String(data.aadharNumber ?? ""),
        accountNumber: String(data.accountNumber ?? ""),
        totalSalary: String(data.totalSalary ?? ""),
      };
    })
    .filter((driver) => driver.driverId && driver.firstName && driver.surname);
}

export function getDriverOptions(): DriverOption[] {
  return getDriverRecords().map((driver) => ({
    value: driver.driverId,
    label: `${driver.driverId} - ${buildDriverName(driver)}`,
    name: buildDriverName(driver),
    totalSalary: driver.totalSalary,
  }));
}

export function findDriverById(driverId: string): DriverOption | undefined {
  return getDriverOptions().find((driver) => driver.value === driverId);
}

export function getNextDriverId(): string {
  const ids = getDriverRecords()
    .map((driver) => Number(driver.driverId.replace(/^DRV-/, "")))
    .filter((value) => Number.isFinite(value));
  const next = (ids.length ? Math.max(...ids) : 0) + 1;
  return `DRV-${String(next).padStart(3, "0")}`;
}
