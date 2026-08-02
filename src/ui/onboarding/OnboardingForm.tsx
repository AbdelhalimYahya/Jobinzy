import { useState } from "react";
import type { FormEvent } from "react";
import type { Profile, ProfileLink } from "../../lib/types";

interface Props {
  initial?: Profile;
  onSubmit: (profile: Profile) => void;
}

/**
 * Step 1 of onboarding (task 2.1) — the core profile form.
 * Required: Full Name, Email, Phone, National ID (explicitly labeled).
 * Optional: Address, repeatable link rows.
 * Reused by the options page "Edit Profile" flow (2.8) with `initial` data.
 */
export function OnboardingForm({ initial, onSubmit }: Props) {
  const [fullName, setFullName] = useState(initial?.fullName ?? "");
  const [email, setEmail] = useState(initial?.email ?? "");
  const [phone, setPhone] = useState(initial?.phone ?? "");
  const [nationalId, setNationalId] = useState(initial?.nationalId ?? "");
  const [address, setAddress] = useState(initial?.address ?? "");
  const [links, setLinks] = useState<ProfileLink[]>(initial?.links ?? []);
  const [errors, setErrors] = useState<Record<string, string>>({});

  function updateLink(index: number, patch: Partial<ProfileLink>) {
    setLinks((prev) => prev.map((l, i) => (i === index ? { ...l, ...patch } : l)));
  }

  function removeLink(index: number) {
    setLinks((prev) => prev.filter((_, i) => i !== index));
  }

  function validate(): boolean {
    const next: Record<string, string> = {};
    if (!fullName.trim()) next.fullName = "Full name is required.";
    if (!email.trim()) next.email = "Email is required.";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      next.email = "Enter a valid email address.";
    }
    if (!phone.trim()) next.phone = "Phone is required.";
    if (!nationalId.trim()) next.nationalId = "National ID is required.";
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    const base = initial ?? ({} as Partial<Profile>);
    onSubmit({
      ...base,
      fullName: fullName.trim(),
      email: email.trim(),
      phone: phone.trim(),
      nationalId: nationalId.trim(),
      address: address.trim() || undefined,
      links: links.filter((l) => l.url.trim() !== ""),
      createdAt: base.createdAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as Profile);
  }

  const inputCls = (key: string) =>
    `jf-input${errors[key] ? " jf-input-error" : ""}`;

  return (
    <form className="jf-form" onSubmit={handleSubmit} noValidate>
      <div className="jf-field">
        <label className="jf-label" htmlFor="onb-fullname">
          Full Name <span className="jf-req">*</span>
        </label>
        <input
          id="onb-fullname"
          className={inputCls("fullName")}
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          placeholder="e.g. Ahmed Hassan"
        />
        {errors.fullName && <p className="jf-error">{errors.fullName}</p>}
      </div>

      <div className="jf-field">
        <label className="jf-label" htmlFor="onb-email">
          Email <span className="jf-req">*</span>
        </label>
        <input
          id="onb-email"
          type="email"
          className={inputCls("email")}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
        />
        {errors.email && <p className="jf-error">{errors.email}</p>}
      </div>

      <div className="jf-field">
        <label className="jf-label" htmlFor="onb-phone">
          Phone <span className="jf-req">*</span>
        </label>
        <input
          id="onb-phone"
          className={inputCls("phone")}
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="+20 100 123 4567"
        />
        {errors.phone && <p className="jf-error">{errors.phone}</p>}
      </div>

      <div className="jf-field">
        <label className="jf-label" htmlFor="onb-nationalid">
          National ID <span className="jf-req">*</span>
        </label>
        <input
          id="onb-nationalid"
          className={inputCls("nationalId")}
          value={nationalId}
          onChange={(e) => setNationalId(e.target.value)}
          placeholder="e.g. 29901010123456"
        />
        <p className="jf-hint">Used to autofill ID fields on application forms.</p>
        {errors.nationalId && <p className="jf-error">{errors.nationalId}</p>}
      </div>

      <div className="jf-field">
        <label className="jf-label" htmlFor="onb-address">
          Address <span className="jf-opt">(optional)</span>
        </label>
        <input
          id="onb-address"
          className={inputCls("address")}
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="e.g. Cairo, Egypt"
        />
      </div>

      <fieldset className="jf-field">
        <legend className="jf-label">
          Links <span className="jf-opt">(portfolio, LinkedIn, GitHub, Drive…)</span>
        </legend>
        {links.map((link, i) => (
          <div className="jf-link-row" key={i}>
            <input
              className="jf-input"
              aria-label={`Link ${i + 1} label`}
              placeholder="Label (e.g. LinkedIn)"
              value={link.label}
              onChange={(e) => updateLink(i, { label: e.target.value })}
            />
            <input
              className="jf-input"
              aria-label={`Link ${i + 1} URL`}
              placeholder="https://…"
              value={link.url}
              onChange={(e) => updateLink(i, { url: e.target.value })}
            />
            <button
              type="button"
              className="jf-btn jf-btn-danger jf-btn-sm"
              onClick={() => removeLink(i)}
              aria-label={`Remove link ${i + 1}`}
            >
              ✕
            </button>
          </div>
        ))}
        <button
          type="button"
          className="jf-btn jf-btn-ghost jf-btn-sm"
          onClick={() => setLinks((prev) => [...prev, { label: "", url: "" }])}
        >
          + Add link
        </button>
      </fieldset>

      <div className="jf-actions">
        <button type="submit" className="jf-btn jf-btn-primary">
          Continue
        </button>
      </div>
    </form>
  );
}
