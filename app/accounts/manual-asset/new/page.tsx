import Link from "next/link";
import { createManualAsset } from "@/app/actions/accounts";
import { PageBody, PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Input, Label, Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export default function NewManualAssetPage() {
  return (
    <div>
      <PageHeader title="Add asset" description="Real estate, vehicles, private investments" />
      <PageBody>
        <Card className="max-w-xl">
          <CardContent className="p-6">
            <form action={createManualAsset} className="space-y-4">
              <div>
                <Label htmlFor="name">Name</Label>
                <Input id="name" name="name" required placeholder="e.g. Primary Residence" className="mt-1" />
              </div>
              <div>
                <Label htmlFor="type">Type</Label>
                <Select id="type" name="type" required className="mt-1">
                  <option value="REAL_ESTATE">Real estate</option>
                  <option value="VEHICLE">Vehicle</option>
                  <option value="COLLECTIBLE">Collectible</option>
                  <option value="PRIVATE_EQUITY">Private equity</option>
                  <option value="OTHER">Other</option>
                </Select>
              </div>
              <div>
                <Label htmlFor="currentValue">Current value</Label>
                <Input id="currentValue" name="currentValue" type="number" step="0.01" required className="mt-1" />
              </div>
              <div>
                <Label htmlFor="purchasePrice">Purchase price (optional)</Label>
                <Input id="purchasePrice" name="purchasePrice" type="number" step="0.01" className="mt-1" />
              </div>
              <div>
                <Label htmlFor="purchaseDate">Purchase date (optional)</Label>
                <Input id="purchaseDate" name="purchaseDate" type="date" className="mt-1" />
              </div>
              <div className="pt-2 flex gap-2">
                <Button type="submit">Add asset</Button>
                <Link href="/accounts"><Button type="button" variant="ghost">Cancel</Button></Link>
              </div>
            </form>
          </CardContent>
        </Card>
      </PageBody>
    </div>
  );
}
