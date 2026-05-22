"use client";

import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Check } from "lucide-react";
import { toast } from "sonner";

export default function SettingsPage() {
  return (
    <div className="space-y-5 max-w-3xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manage clinic, channels, team and billing.
        </p>
      </div>

      <Tabs defaultValue="clinic">
        <TabsList>
          <TabsTrigger value="clinic">Clinic info</TabsTrigger>
          <TabsTrigger value="channels">Channels</TabsTrigger>
          <TabsTrigger value="team">Team</TabsTrigger>
          <TabsTrigger value="billing">Billing</TabsTrigger>
        </TabsList>

        <TabsContent value="clinic" className="mt-4">
          <div className="rounded-lg border bg-card p-6 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Clinic name</Label>
                <Input defaultValue="Lumière" className="mt-1.5" />
              </div>
              <div>
                <Label>Timezone</Label>
                <Input defaultValue="America/Chicago" className="mt-1.5" />
              </div>
              <div className="col-span-2">
                <Label>Address</Label>
                <Input defaultValue="300 W 6th St, Austin TX 78701" className="mt-1.5" />
              </div>
              <div className="col-span-2">
                <Label>Business hours</Label>
                <Input defaultValue="Tue – Sat · 10am – 7pm" className="mt-1.5" />
              </div>
              <div className="col-span-2">
                <Label>Logo</Label>
                <div className="mt-1.5 rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
                  Drop a PNG or SVG, or click to browse
                </div>
              </div>
            </div>
            <Button onClick={() => toast.success("Clinic info saved")}>Save changes</Button>
          </div>
        </TabsContent>

        <TabsContent value="channels" className="mt-4 space-y-4">
          <div className="rounded-lg border bg-card p-5 flex items-center justify-between">
            <div>
              <div className="font-medium">WhatsApp Business</div>
              <div className="text-sm text-muted-foreground mt-0.5">
                Connected to +1 (512) 555-0142
              </div>
            </div>
            <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md bg-success/10 text-success border border-success/20">
              <Check className="h-3 w-3" />
              Connected
            </span>
          </div>
          <div className="rounded-lg border bg-card p-5 flex items-center justify-between">
            <div>
              <div className="font-medium">Email sender</div>
              <div className="text-sm text-muted-foreground mt-0.5">hello@lumiere-spa.com</div>
            </div>
            <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md bg-success/10 text-success border border-success/20">
              <Check className="h-3 w-3" />
              Connected
            </span>
          </div>
          <Button variant="outline" onClick={() => toast.success("Test message queued")}>
            Send test message
          </Button>
        </TabsContent>

        <TabsContent value="team" className="mt-4">
          <div className="rounded-lg border bg-card overflow-hidden">
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground bg-muted/40">
                <tr>
                  <th className="text-left font-medium px-4 py-2.5">Name</th>
                  <th className="text-left font-medium px-4 py-2.5">Email</th>
                  <th className="text-left font-medium px-4 py-2.5">Role</th>
                  <th className="text-left font-medium px-4 py-2.5">Last login</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {[
                  ["Dr. Sofia Marchetti", "sofia@lumiere-spa.com", "Owner", "Today, 9:14am"],
                  ["Lauren Park", "lauren@lumiere-spa.com", "Aesthetician", "Yesterday, 6:22pm"],
                  ["Maya Ortiz", "maya@lumiere-spa.com", "Aesthetician", "2 days ago"],
                  ["James Chen", "james@lumiere-spa.com", "Coordinator", "Today, 8:01am"],
                ].map(([n, e, r, l]) => (
                  <tr key={n}>
                    <td className="px-4 py-3 font-medium">{n}</td>
                    <td className="px-4 py-3 text-muted-foreground">{e}</td>
                    <td className="px-4 py-3">
                      <span className="text-[11px] px-2 py-0.5 rounded-md border bg-secondary">
                        {r}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{l}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TabsContent>

        <TabsContent value="billing" className="mt-4">
          <div className="rounded-lg border bg-card p-6">
            <div className="flex items-start justify-between">
              <div>
                <div className="text-sm text-muted-foreground">Current plan</div>
                <div className="text-xl font-semibold mt-0.5">Lumière Pro</div>
                <div className="text-sm text-muted-foreground mt-1">
                  $149 / month · billed monthly
                </div>
              </div>
              <Button variant="outline">Manage plan</Button>
            </div>
            <div className="border-t mt-5 pt-5 grid grid-cols-2 gap-4 text-sm">
              <div>
                <div className="text-muted-foreground text-xs">Next invoice</div>
                <div className="font-medium mt-0.5">June 1, 2026</div>
              </div>
              <div>
                <div className="text-muted-foreground text-xs">Payment method</div>
                <div className="font-medium mt-0.5">Visa •• 4242</div>
              </div>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
