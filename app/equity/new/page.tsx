import { PageBody, PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { RsuGrantForm } from "@/components/rsu-grant-form";

export default function NewRsuGrantPage() {
  return (
    <div>
      <PageHeader title="Add stock grant" description="Enter your RSU grant details to see when your shares become yours." />
      <PageBody>
        <Card className="max-w-xl">
          <CardContent className="p-6">
            <RsuGrantForm />
          </CardContent>
        </Card>
      </PageBody>
    </div>
  );
}
