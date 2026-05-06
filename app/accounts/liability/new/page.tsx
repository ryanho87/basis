"use client";

import Link from "next/link";
import { useState } from "react";
import { createLiability } from "@/app/actions/accounts";
import { PageBody, PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Input, Label, Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export default function NewLiabilityPage() {
  const [isStudentLoan, setIsStudentLoan] = useState(false);

  return (
    <div>
      <PageHeader title="Add liability" description="Mortgage, auto loan, credit card, student loan" />
      <PageBody>
        <Card className="max-w-xl">
          <CardContent className="p-6">
            <form action={createLiability} className="space-y-4">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="isStudentLoan"
                  checked={isStudentLoan}
                  onChange={(e) => setIsStudentLoan(e.target.checked)}
                />
                This is a student loan (enables PSLF + repayment plan tracking)
              </label>

              {isStudentLoan ? (
                <>
                  <div>
                    <Label htmlFor="servicer">Servicer</Label>
                    <Input id="servicer" name="servicer" placeholder="Nelnet, Mohela, etc." className="mt-1" />
                  </div>
                  <div>
                    <Label htmlFor="loanType">Loan type</Label>
                    <Select id="loanType" name="loanType" required className="mt-1">
                      <option value="FEDERAL_DIRECT">Federal Direct</option>
                      <option value="FEDERAL_PLUS">Federal PLUS</option>
                      <option value="PRIVATE">Private</option>
                      <option value="OTHER">Other</option>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="balance">Balance</Label>
                    <Input id="balance" name="balance" type="number" step="0.01" required className="mt-1" />
                  </div>
                  <div>
                    <Label htmlFor="interestRate">Interest rate (%)</Label>
                    <Input id="interestRate" name="interestRate" type="number" step="0.01" required className="mt-1" />
                  </div>
                  <div>
                    <Label htmlFor="monthlyPayment">Monthly payment</Label>
                    <Input id="monthlyPayment" name="monthlyPayment" type="number" step="0.01" className="mt-1" />
                  </div>
                  <div>
                    <Label htmlFor="repaymentPlan">Repayment plan</Label>
                    <Select id="repaymentPlan" name="repaymentPlan" className="mt-1">
                      <option value="">—</option>
                      <option value="STANDARD">Standard</option>
                      <option value="GRADUATED">Graduated</option>
                      <option value="IBR">IBR</option>
                      <option value="PAYE">PAYE</option>
                      <option value="SAVE">SAVE</option>
                      <option value="ICR">ICR</option>
                      <option value="REFINANCED">Refinanced</option>
                    </Select>
                  </div>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" name="pslfEligible" /> PSLF eligible
                  </label>
                </>
              ) : (
                <>
                  <div>
                    <Label htmlFor="name">Name</Label>
                    <Input id="name" name="name" required placeholder="e.g. Mortgage" className="mt-1" />
                  </div>
                  <div>
                    <Label htmlFor="type">Type</Label>
                    <Select id="type" name="type" required className="mt-1">
                      <option value="MORTGAGE">Mortgage</option>
                      <option value="AUTO_LOAN">Auto loan</option>
                      <option value="CREDIT_CARD">Credit card</option>
                      <option value="PERSONAL_LOAN">Personal loan</option>
                      <option value="OTHER">Other</option>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="currentBalance">Balance</Label>
                    <Input id="currentBalance" name="currentBalance" type="number" step="0.01" required className="mt-1" />
                  </div>
                  <div>
                    <Label htmlFor="interestRate">Interest rate (%)</Label>
                    <Input id="interestRate" name="interestRate" type="number" step="0.01" className="mt-1" />
                  </div>
                  <div>
                    <Label htmlFor="monthlyPayment">Monthly payment</Label>
                    <Input id="monthlyPayment" name="monthlyPayment" type="number" step="0.01" className="mt-1" />
                  </div>
                </>
              )}

              <div className="pt-2 flex gap-2">
                <Button type="submit">Add liability</Button>
                <Link href="/accounts"><Button type="button" variant="ghost">Cancel</Button></Link>
              </div>
            </form>
          </CardContent>
        </Card>
      </PageBody>
    </div>
  );
}
