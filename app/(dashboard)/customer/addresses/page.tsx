import type { Metadata } from "next";

import { PageHeader } from "@/components/layout/page-header";
import { AddressManager, type AddressT } from "@/components/customer/address-manager";
import { LocationPermissionCard } from "@/components/customer/location-permission-card";
import { getJSON } from "@/lib/api/client";
import { requireRole } from "@/lib/auth/session";
import { getSessionUser } from "@/lib/auth/current-user";
import { customerLocationStatus } from "@/lib/services/customer-location";
import { getT } from "@/lib/i18n/server";
import type { Paginated } from "@/types";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("pages.addressesTitle") };
}

/** /customer/addresses — multi-address book (Home / Office / Second Home / custom). */
export default async function CustomerAddressesPage() {
  const { t } = await getT();
  await requireRole("customer");
  const me = (await getSessionUser())!;
  const [data, location] = await Promise.all([
    getJSON<Paginated<AddressT>>("/customer/addresses/"),
    customerLocationStatus(me.id),
  ]);

  return (
    <>
      <PageHeader title={t("pages.addressesTitle")} subtitle={t("addresses.subtitle")} />
      {/* Live GPS location — kept SEPARATE from the saved-address book (req #12/#21). */}
      <div className="mb-6">
        <LocationPermissionCard initial={location} />
      </div>
      <AddressManager addresses={data.results} />
    </>
  );
}
