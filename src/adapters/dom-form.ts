import type { Page } from "playwright";

import type { DomForm } from "./types.js";

export async function extractDomForms(page: Page): Promise<readonly DomForm[]> {
  return page.evaluate(() => {
    const normalize = (value: string | null | undefined): string | undefined => {
      const compact = value?.replace(/\s+/g, " ").trim();
      return compact === undefined || compact.length === 0 ? undefined : compact;
    };
    const cssEscape = (value: string): string => {
      return globalThis.CSS.escape(value);
    };
    const attributeEscape = (value: string): string =>
      value.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
    const labelFor = (
      element: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement,
    ): {
      label?: string;
      source: "aria-label" | "aria-labelledby" | "label" | "placeholder" | "none";
    } => {
      const ariaLabel = normalize(element.getAttribute("aria-label"));
      if (ariaLabel !== undefined) {
        return { label: ariaLabel, source: "aria-label" };
      }
      const labelledBy = normalize(element.getAttribute("aria-labelledby"));
      if (labelledBy !== undefined) {
        const text = normalize(
          labelledBy
            .split(/\s+/)
            .map((id) => document.getElementById(id)?.textContent ?? "")
            .join(" "),
        );
        if (text !== undefined) {
          return { label: text, source: "aria-labelledby" };
        }
      }
      const label = normalize(element.labels?.[0]?.textContent);
      if (label !== undefined) {
        return { label, source: "label" };
      }
      const placeholder = normalize(element.getAttribute("placeholder"));
      if (placeholder !== undefined) {
        return { label: placeholder, source: "placeholder" };
      }
      return { source: "none" };
    };

    return [...document.forms].map((form, formIndex) => {
      const formCss =
        form.id.length > 0
          ? `#${cssEscape(form.id)}`
          : `form:nth-of-type(${String(formIndex + 1)})`;
      const controls = [
        ...form.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(
          "input[name], select[name], textarea[name]",
        ),
      ].filter((control) => {
        if (!(control instanceof HTMLInputElement)) {
          return true;
        }
        return !["button", "hidden", "image", "reset", "submit"].includes(control.type);
      });

      const fields = controls.map((control, order) => {
        const tagName = control.tagName.toLowerCase() as "input" | "select" | "textarea";
        const sameName = controls.filter(
          (candidate) => candidate.tagName === control.tagName && candidate.name === control.name,
        );
        const selector =
          control.id.length > 0
            ? `#${cssEscape(control.id)}`
            : `${formCss} ${tagName}[name="${attributeEscape(control.name)}"]`;
        const { label, source } = labelFor(control);
        const constraints = {
          ...(control.hasAttribute("max") ? { max: control.getAttribute("max") ?? "" } : {}),
          ...(control.hasAttribute("maxlength")
            ? { maxLength: Number(control.getAttribute("maxlength")) }
            : {}),
          ...(control.hasAttribute("min") ? { min: control.getAttribute("min") ?? "" } : {}),
          ...(control.hasAttribute("minlength")
            ? { minLength: Number(control.getAttribute("minlength")) }
            : {}),
          ...(control.hasAttribute("pattern") && control instanceof HTMLInputElement
            ? { pattern: control.pattern }
            : {}),
          required: control.required,
          ...(control.hasAttribute("step") ? { step: control.getAttribute("step") ?? "" } : {}),
        };
        return {
          ...(control.autocomplete.length > 0 ? { autocomplete: control.autocomplete } : {}),
          constraints,
          disabled: control.disabled,
          formIndex,
          ...(control.id.length > 0 ? { id: control.id } : {}),
          inputType: control instanceof HTMLInputElement ? control.type : tagName,
          ...(label === undefined ? {} : { label }),
          labelSource: source,
          locator: {
            css: selector,
            index: control.id.length > 0 ? 0 : sameName.indexOf(control),
          },
          multiple:
            (control instanceof HTMLInputElement || control instanceof HTMLSelectElement) &&
            control.multiple,
          name: control.name,
          ...(control instanceof HTMLSelectElement
            ? { options: [...control.options].map((option) => option.value) }
            : {}),
          order,
          readOnly:
            (control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement) &&
            control.readOnly,
          tagName,
        };
      });

      return {
        action: form.action,
        fields,
        ...(form.id.length > 0 ? { id: form.id } : {}),
        index: formIndex,
        locator: { css: formCss, index: 0 },
        method: form.method.toLowerCase(),
        ...(form.name.length > 0 ? { name: form.name } : {}),
      };
    });
  });
}
