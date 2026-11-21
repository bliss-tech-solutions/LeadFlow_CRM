import os
from PIL import Image, ImageDraw, ImageFilter, ImageFont

def generate_all_assets():
    W, H = 2048, 2048

    # -------------------------------------------------------------
    # 1. Generate Main App Icon (icon.png - 1024x1024)
    # -------------------------------------------------------------
    base = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    draw = ImageDraw.Draw(base)

    # Modern luxury gradient: Deep Midnight Indigo (#0F172A) to Royal Electric Indigo (#4338CA) to Violet (#6366F1)
    for y in range(H):
        t = y / H
        if t < 0.5:
            # 0 to 0.5: #0F172A (15, 23, 42) -> #312E81 (49, 46, 129)
            sub_t = t * 2
            r = int(15 * (1 - sub_t) + 49 * sub_t)
            g = int(23 * (1 - sub_t) + 46 * sub_t)
            b = int(42 * (1 - sub_t) + 129 * sub_t)
        else:
            # 0.5 to 1.0: #312E81 (49, 46, 129) -> #4F46E5 (79, 70, 229)
            sub_t = (t - 0.5) * 2
            r = int(49 * (1 - sub_t) + 79 * sub_t)
            g = int(46 * (1 - sub_t) + 70 * sub_t)
            b = int(129 * (1 - sub_t) + 229 * sub_t)
        draw.line([(0, y), (W, y)], fill=(r, g, b, 255))

    # Glow orb in upper center
    glow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    glow_draw = ImageDraw.Draw(glow)
    cx, cy = W // 2, int(H * 0.40)
    radius = int(W * 0.55)
    for rad in range(radius, 0, -12):
        alpha = int(40 * (1 - rad / radius)**2)
        glow_draw.ellipse([cx - rad, cy - rad, cx + rad, cy + rad], fill=(129, 140, 248, alpha))
    base = Image.alpha_composite(base, glow)

    # Emblem definition: Modern geometric 'L' + dynamic forward growth stream (representing CRM pipeline & real estate expansion)
    # Main 'L' shape:
    # Vertical pillar: from x=580 to x=840, y=500 to y=1520
    # Base beam: from x=580 to x=1500, y=1260 to y=1520
    # Chamfered elegant corner cuts
    emblem = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    e_draw = ImageDraw.Draw(emblem)

    # Soft ambient drop shadow
    shadow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    s_draw = ImageDraw.Draw(shadow)

    v_pillar = [(600, 520), (840, 520), (840, 1500), (600, 1500)]
    h_beam = [(600, 1260), (1420, 1260), (1500, 1380), (1420, 1500), (600, 1500)]

    s_draw.polygon([(x+15, y+35) for x, y in v_pillar], fill=(0, 0, 0, 120))
    s_draw.polygon([(x+15, y+35) for x, y in h_beam], fill=(0, 0, 0, 120))
    shadow = shadow.filter(ImageFilter.GaussianBlur(35))
    base = Image.alpha_composite(base, shadow)

    # Fill L with crisp pure white
    e_draw.polygon(v_pillar, fill=(255, 255, 255, 255))
    e_draw.polygon(h_beam, fill=(255, 255, 255, 255))

    # Dynamic pipeline ribbon connecting into the flow (Cyan to Teal highlight)
    stream_pts = [(780, 840), (1120, 840), (1420, 1140), (1240, 1140), (1020, 920), (780, 920)]
    stream_shadow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(stream_shadow).polygon([(x+8, y+16) for x, y in stream_pts], fill=(0, 0, 0, 80))
    stream_shadow = stream_shadow.filter(ImageFilter.GaussianBlur(16))
    base = Image.alpha_composite(base, stream_shadow)
    e_draw.polygon(stream_pts, fill=(56, 189, 248, 255))

    # Lead conversion beacon dot (pulsing white glow)
    beacon = (1420, 1140)
    for r in range(64, 0, -4):
        alpha = int(255 * (1 - r / 64)**1.6)
        e_draw.ellipse([beacon[0]-r, beacon[1]-r, beacon[0]+r, beacon[1]+r], fill=(255, 255, 255, alpha))

    base = Image.alpha_composite(base, emblem)

    # Save icon.png (1024x1024)
    icon_1024 = base.resize((1024, 1024), Image.Resampling.LANCZOS).convert("RGB")
    icon_1024.save("mobile/assets/icon.png", quality=95)
    print("Saved mobile/assets/icon.png")

    # -------------------------------------------------------------
    # 2. Android Adaptive Icon Foreground (512x512 RGBA)
    # -------------------------------------------------------------
    # Emblem scaled to fit Android safe zone (around 280px within 512x512)
    fg_canvas = Image.new("RGBA", (512, 512), (0, 0, 0, 0))
    # Scale emblem down from 2048 to ~360
    emblem_scaled = emblem.resize((360, 360), Image.Resampling.LANCZOS)
    # Composite centered at (76, 76)
    fg_canvas.paste(emblem_scaled, (76, 76), emblem_scaled)
    fg_canvas.save("mobile/assets/android-icon-foreground.png")
    print("Saved mobile/assets/android-icon-foreground.png")

    # -------------------------------------------------------------
    # 3. Android Adaptive Icon Background (512x512 RGB)
    # -------------------------------------------------------------
    bg_canvas = Image.new("RGB", (512, 512), (30, 27, 75)) # #1E1B4B
    bg_draw = ImageDraw.Draw(bg_canvas)
    for y in range(512):
        t = y / 512
        r = int(15 * (1 - t) + 49 * t)
        g = int(23 * (1 - t) + 46 * t)
        b = int(42 * (1 - t) + 129 * t)
        bg_draw.line([(0, y), (512, y)], fill=(r, g, b))
    bg_canvas.save("mobile/assets/android-icon-background.png")
    print("Saved mobile/assets/android-icon-background.png")

    # -------------------------------------------------------------
    # 4. Splash Screen Icon (splash-icon.png - 1024x1024 RGBA)
    # -------------------------------------------------------------
    splash = Image.new("RGBA", (1024, 1024), (0, 0, 0, 0))
    # Center emblem (size 340x340) in upper-middle
    s_emblem = base.resize((340, 340), Image.Resampling.LANCZOS)
    
    # Mask s_emblem into smooth rounded rectangle
    mask = Image.new("L", (340, 340), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, 340, 340], radius=72, fill=255)
    s_emblem.putalpha(mask)

    splash.paste(s_emblem, (342, 260), s_emblem)

    # Load TBS logo
    tbs_path = "mobile/assets/tbs-dark.jpg"
    if os.path.exists(tbs_path):
        tbs_img = Image.open(tbs_path).convert("RGBA")
        # Resize TBS logo proportionally (width ~180)
        tbs_w = 180
        tbs_h = int(tbs_img.height * (tbs_w / tbs_img.width))
        tbs_resized = tbs_img.resize((tbs_w, tbs_h), Image.Resampling.LANCZOS)
        # Position near bottom at y=780
        tbs_x = (1024 - tbs_w) // 2
        tbs_y = 780
        splash.paste(tbs_resized, (tbs_x, tbs_y), tbs_resized)

    splash.save("mobile/assets/splash-icon.png")
    print("Saved mobile/assets/splash-icon.png")

    # -------------------------------------------------------------
    # 5. Favicon (48x48)
    # -------------------------------------------------------------
    fav = base.resize((48, 48), Image.Resampling.LANCZOS).convert("RGBA")
    fav.save("mobile/assets/favicon.png")
    print("Saved mobile/assets/favicon.png")

if __name__ == "__main__":
    generate_all_assets()
