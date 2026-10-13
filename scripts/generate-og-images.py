import math
from PIL import Image, ImageDraw, ImageFont, ImageFilter

W, H = 1200, 630

def create_og_image(lang="en", output_path="public/brand/og-image.png"):
    # Base dark ink canvas
    base = Image.new("RGBA", (W, H), (11, 9, 9, 255))
    draw = ImageDraw.Draw(base)

    # 1. Subtle background glow (red ambient light on the right)
    glow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    glow_draw = ImageDraw.Draw(glow)
    glow_draw.ellipse([700, -100, 1400, 600], fill=(224, 0, 0, 38))
    glow = glow.filter(ImageFilter.GaussianBlur(80))
    base.alpha_composite(glow)

    # 2. Diagonal sashes (KSC signature angle)
    sash_layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    sash_draw = ImageDraw.Draw(sash_layer)
    # Red sash across upper right
    sash_points = [(850, -50), (1300, -50), (1050, 450), (600, 450)]
    sash_draw.polygon(sash_points, fill=(180, 0, 0, 45))
    # Yellow accent line
    yellow_points = [(780, 430), (1230, 430), (1220, 445), (770, 445)]
    sash_draw.polygon(yellow_points, fill=(255, 242, 0, 140))
    base.alpha_composite(sash_layer)

    # 3. Load & paste crest on the right
    crest = Image.open("public/brand/ksc-crest.png").convert("RGBA")
    crest_size = 360
    crest = crest.resize((crest_size, int(crest_size * (crest.height / crest.width))), Image.Resampling.LANCZOS)
    crest_x = 760
    crest_y = 125

    # Shadow for crest
    crest_shadow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    shadow_draw = ImageDraw.Draw(crest_shadow)
    shadow_draw.ellipse([crest_x - 10, crest_y + 10, crest_x + crest.width + 10, crest_y + crest.height + 25], fill=(0, 0, 0, 160))
    crest_shadow = crest_shadow.filter(ImageFilter.GaussianBlur(30))
    base.alpha_composite(crest_shadow)

    # Paste crest
    base.alpha_composite(crest, (crest_x, crest_y))

    # KEDA badge next to crest (bottom right)
    keda = Image.open("public/brand/keda-logo.png").convert("RGBA")
    keda_w, keda_h = 110, int(110 * (keda.height / keda.width))
    keda = keda.resize((keda_w, keda_h), Image.Resampling.LANCZOS)
    
    # White rounded container for KEDA
    badge_x, badge_y = 660, 390
    badge_pad = 12
    badge_w = keda_w + badge_pad * 2
    badge_h = keda_h + badge_pad * 2
    badge = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    b_draw = ImageDraw.Draw(badge)
    b_draw.rounded_rectangle([badge_x, badge_y, badge_x + badge_w, badge_y + badge_h], radius=16, fill=(255, 255, 255, 240))
    badge.paste(keda, (badge_x + badge_pad, badge_y + badge_pad), keda)
    base.alpha_composite(badge)

    # 4. Text content on the left
    text_draw = ImageDraw.Draw(base)

    if lang == "ta":
        font_eyebrow = ImageFont.truetype("C:/Windows/Fonts/Nirmala.ttc", 22, index=1)
        font_title1 = ImageFont.truetype("C:/Windows/Fonts/Nirmala.ttc", 68, index=1)
        font_title2 = ImageFont.truetype("C:/Windows/Fonts/Nirmala.ttc", 54, index=1)
        font_sub = ImageFont.truetype("C:/Windows/Fonts/Nirmala.ttc", 28, index=0)
        font_meta = ImageFont.truetype("C:/Windows/Fonts/Nirmala.ttc", 22, index=1)

        eyebrow_text = "பெரியநீலாவணை · 1981 முதல்"
        title_line1 = "காவேரி"
        title_line2 = "விளையாட்டுக் கழகம்"
        subtitle = "கிரிக்கெட்  ·  இலவச வகுப்புகள்  ·  சமூகம்"
        domain_label = "periyaneelavanaikaverysports.club/ta"
    else:
        font_eyebrow = ImageFont.truetype("C:/Windows/Fonts/Nirmala.ttc", 22, index=1)
        font_title1 = ImageFont.truetype("C:/Windows/Fonts/Nirmala.ttc", 76, index=1)
        font_title2 = ImageFont.truetype("C:/Windows/Fonts/Nirmala.ttc", 62, index=1)
        font_sub = ImageFont.truetype("C:/Windows/Fonts/Nirmala.ttc", 28, index=0)
        font_meta = ImageFont.truetype("C:/Windows/Fonts/Nirmala.ttc", 22, index=1)

        eyebrow_text = "PERIYANEELAVANAI · SINCE 1981"
        title_line1 = "KAVERY"
        title_line2 = "SPORTS CLUB"
        subtitle = "Cricket, Free Classes & Community"
        domain_label = "periyaneelavanaikaverysports.club"

    left_margin = 80
    curr_y = 90

    # Eyebrow tag in crest yellow
    text_draw.text((left_margin, curr_y), eyebrow_text, fill=(255, 242, 0, 255), font=font_eyebrow)
    curr_y += 48

    # Title line 1 in pure white
    text_draw.text((left_margin, curr_y), title_line1, fill=(255, 255, 255, 255), font=font_title1)
    curr_y += 82 if lang == "ta" else 88

    # Title line 2 in crest yellow accent
    text_draw.text((left_margin, curr_y), title_line2, fill=(255, 242, 0, 255), font=font_title2)
    curr_y += 75 if lang == "ta" else 80

    # Thin separator line
    text_draw.line([(left_margin, curr_y), (left_margin + 500, curr_y)], fill=(255, 255, 255, 45), width=2)
    curr_y += 28

    # Subtitle
    text_draw.text((left_margin, curr_y), subtitle, fill=(189, 179, 181, 255), font=font_sub)
    curr_y += 68

    # Pill for domain / URL
    pill_w = 420 if lang == "ta" else 390
    pill_h = 44
    text_draw.rounded_rectangle([left_margin, curr_y, left_margin + pill_w, curr_y + pill_h], radius=22, fill=(30, 24, 26, 200), outline=(255, 255, 255, 35))
    text_draw.text((left_margin + 20, curr_y + 9), domain_label, fill=(255, 255, 255, 220), font=font_meta)

    # 5. Convert to RGB and save
    final_img = base.convert("RGB")
    final_img.save(output_path, "PNG", optimize=True)
    print(f"Generated {output_path} ({W}x{H})")

create_og_image("en", "public/brand/og-image-en.png")
create_og_image("ta", "public/brand/og-image-ta.png")
create_og_image("en", "public/brand/og-image.png")
