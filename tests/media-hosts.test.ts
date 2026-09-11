import { describe, expect, it } from "vitest";
import { isAllowedImageUrl, proxiedImageUrl } from "@/lib/media/providers/hosts";

/**
 * The proxy fetches whatever URL it is handed, so this list is the only thing
 * standing between it and being a general-purpose request forwarder. These
 * cases are the ones an attacker would actually try.
 */
describe("isAllowedImageUrl", () => {
  it("accepts the provider hosts over HTTPS", () => {
    expect(isAllowedImageUrl("https://cdn.pixabay.com/photo/1/2/apple.jpg")).toBe(true);
    expect(isAllowedImageUrl("https://images.pexels.com/photos/1/a.jpeg?w=640")).toBe(true);
    expect(isAllowedImageUrl("https://images.unsplash.com/photo-123?w=640")).toBe(true);
  });

  it("refuses plain HTTP even on an allowed host", () => {
    expect(isAllowedImageUrl("http://images.pexels.com/photos/1/a.jpeg")).toBe(false);
  });

  it("refuses a host that merely ends with an allowed one", () => {
    expect(isAllowedImageUrl("https://evil-pixabay.com/x.jpg")).toBe(false);
    expect(isAllowedImageUrl("https://pixabay.com.attacker.test/x.jpg")).toBe(false);
  });

  it("refuses credentials smuggled into the authority", () => {
    expect(isAllowedImageUrl("https://images.pexels.com@attacker.test/x.jpg")).toBe(false);
  });

  it("refuses internal addresses and non-HTTP schemes", () => {
    expect(isAllowedImageUrl("http://169.254.169.254/latest/meta-data/")).toBe(false);
    expect(isAllowedImageUrl("https://localhost/admin")).toBe(false);
    expect(isAllowedImageUrl("file:///etc/passwd")).toBe(false);
    expect(isAllowedImageUrl("data:image/png;base64,AAAA")).toBe(false);
  });

  it("refuses anything that is not a URL", () => {
    expect(isAllowedImageUrl("")).toBe(false);
    expect(isAllowedImageUrl("/api/media/proxy?url=x")).toBe(false);
  });
});

describe("proxiedImageUrl", () => {
  it("routes a provider image through this origin", () => {
    const url = "https://cdn.pixabay.com/photo/1/2/apple.jpg?x=1";
    expect(proxiedImageUrl(url)).toBe(`/api/media/proxy?url=${encodeURIComponent(url)}`);
  });

  it("leaves uploads and blob URLs alone", () => {
    expect(proxiedImageUrl("blob:http://localhost:3000/abc")).toBe("blob:http://localhost:3000/abc");
    expect(proxiedImageUrl("/api/media/file/xyz")).toBe("/api/media/file/xyz");
  });

  it("does not proxy a host that is not on the list", () => {
    expect(proxiedImageUrl("https://attacker.test/x.jpg")).toBe("https://attacker.test/x.jpg");
  });
});
