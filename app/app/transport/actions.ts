"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { getScopedDb, scopedCreateData } from "@/lib/tenant-db";
import { requireModuleAccess } from "@/lib/permissions";
import { parseMoney } from "@/lib/validation";
import { UserError, requireMoney, runAction, type ActionResult } from "@/lib/action-result";

export type FormState = { error?: string };

export async function createRoute(_prevState: FormState, formData: FormData): Promise<FormState> {
  await requireModuleAccess("Transport", "EDIT");
  const sdb = await getScopedDb();

  const name = formData.get("name");
  const vehicleId = formData.get("vehicleId");
  const feeAmount = formData.get("feeAmount");

  if (typeof name !== "string" || !name.trim()) return { error: "Route name is required." };
  const fee = parseMoney(feeAmount, "Route fee");
  if (fee.error) return { error: fee.error };

  const vehicleIdValue = typeof vehicleId === "string" && vehicleId ? vehicleId : null;
  if (vehicleIdValue) {
    const vehicle = await sdb.transportVehicle.findUnique({ where: { id: vehicleIdValue }, select: { id: true } });
    if (!vehicle) return { error: "That vehicle could not be found." };
  }

  const route = await sdb.transportRoute.create({
    data: scopedCreateData<Prisma.TransportRouteUncheckedCreateInput>({
      name: name.trim(),
      vehicleId: vehicleIdValue,
      feeAmount: fee.value,
    }),
  });

  revalidatePath("/app/transport");
  redirect(`/app/transport?tab=routes&route=${route.id}`);
}

export async function updateRouteVehicleAndFee(routeId: string, vehicleId: string | null, feeAmount: number | null) {
  return runAction(async () => {
    await requireModuleAccess("Transport", "EDIT");
    requireMoney(feeAmount, "Route fee");
    const sdb = await getScopedDb();
    if (vehicleId) await sdb.transportVehicle.findUniqueOrThrow({ where: { id: vehicleId }, select: { id: true } });
    await sdb.transportRoute.update({ where: { id: routeId }, data: { vehicleId, feeAmount } });
    revalidatePath("/app/transport");
  }, "updateRouteVehicleAndFee");
}

export async function addStop(routeId: string, stopName: string, pickupTime: string) {
  await requireModuleAccess("Transport", "EDIT");
  const sdb = await getScopedDb();
  await sdb.transportRoute.findUniqueOrThrow({ where: { id: routeId }, select: { id: true } });
  const count = await sdb.transportStop.count({ where: { routeId } });

  await sdb.transportStop.create({
    data: scopedCreateData<Prisma.TransportStopUncheckedCreateInput>({
      routeId,
      stopName,
      pickupTime: pickupTime ? new Date(`1970-01-01T${pickupTime}:00`) : null,
      sequence: count + 1,
    }),
  });

  revalidatePath("/app/transport");
}

// ------------------------------------------------------- Student assignment

/**
 * Assigns (or re-assigns) a student to a route + one of its stops — upserts
 * on studentId, since a student can only ever be on one route at a time.
 * Capacity belongs to the vehicle, so seats are counted across every route
 * that vehicle runs. Returns { error } for a full vehicle rather than
 * throwing, so the message reaches the user in production.
 */
export async function assignStudentToRoute(studentId: string, routeId: string, stopId: string): Promise<ActionResult> {
  await requireModuleAccess("Transport", "EDIT");
  return runAction(async () => {
    const sdb = await getScopedDb();
    const route = await sdb.transportRoute.findUnique({ where: { id: routeId }, include: { vehicle: true } });
    if (!route) throw new UserError("This route no longer exists. Please refresh the page.");
    const [student, stop] = await Promise.all([
      sdb.student.findUnique({ where: { id: studentId }, select: { id: true } }),
      sdb.transportStop.findFirst({ where: { id: stopId, routeId }, select: { id: true } }),
    ]);
    if (!student) throw new UserError("This student no longer exists. Please refresh the page.");
    if (!stop) throw new UserError("Pick a stop on this route.");

    const vehicle = route.vehicle;
    if (vehicle?.capacity != null) {
      const seated = await sdb.studentTransportAssignment.count({ where: { route: { vehicleId: vehicle.id }, studentId: { not: studentId } } });
      if (seated >= vehicle.capacity) {
        throw new UserError(`This vehicle is full (${seated}/${vehicle.capacity} seats). Increase capacity or choose another vehicle.`);
      }
    }

    await sdb.studentTransportAssignment.upsert({
      where: { studentId },
      update: { routeId, stopId },
      create: scopedCreateData<Prisma.StudentTransportAssignmentUncheckedCreateInput>({ studentId, routeId, stopId }),
    });

    revalidatePath("/app/transport");
    return {};
  }, "assignStudentToRoute");
}

export async function unassignStudentFromRoute(studentId: string) {
  await requireModuleAccess("Transport", "EDIT");
  const sdb = await getScopedDb();
  await sdb.studentTransportAssignment.delete({ where: { studentId } }).catch(() => {});
  revalidatePath("/app/transport");
}
