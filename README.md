# Everything Is Down: Seeing Through the Earth

**The world is *down*, not around!** When we think about where the rest of the world is,
we think of places on a map. But relative to you, right now, nearly all of it is beneath
your feet, somewhere you could point to directly, through thousands of miles of earth.
A family of single-file web apps draws the far side of the planet: live, correctly
oriented, locked to the world. Straight down is your exact antipode; the horizon is your
own position, in every direction at once.

(If "everything is down" sounds too strong: of course, a lot of stuff on your continent is
more "next to you" than "under you". But curvature kicks in more quickly than you think.
Stand in New York and look directly at Los Angeles (the actual straight line to the city,
not the direction you'd drive) and you're looking at a spot on the ground only about
17 feet away from you. The line dips half the arc you span: NYC to LA is 35.4° around the
globe, so the sight line drops 17.7° below your horizontal.)

**`index.html`** is the hub: pick your device (phone / laptop / monitor / none) and it
routes you to the right app. The apps:

| path | app | device |
|---|---|---|
| `ar/` | **The phone app**: the far side as a grey crust, lit where it is daytime, against the real sky beyond it (stars, figures, Sun, Moon, planets); or over the live camera feed. No build step, no frameworks, no network use after load | phone |
| `window-imu/` | **Earth Window (IMU)**: tilt the device like a pane of glass; sensors only, no camera | phone / tablet |
| `window/` | **Earth Window (head-tracked)**: webcam head tracking turns the screen into a literal window with parallax | laptop |
| `fly/` | **Fly Through**: free-flying 3D Earth, WASD + mouse | monitor |
| `circle/` | **The Circle at Your Feet**: if the ground were a glass circle of radius r, how much of the far side could you see? Cross-section + far-side map; radius = your height ⇒ half the planet | anything |
| `aim/` | **Arm Aim**: where to point your arm to aim at any city through the Earth | other |
| `extras/` | earlier experiments (first sketch, fly v1, orbit globes, day/night) | - |

## Run it on a phone

Sensors and camera require HTTPS, so serve the folder over TLS on your LAN:

```sh
./serve.sh
```

then open `https://<this-mac's-ip>:8443` on the phone (same Wi-Fi) and accept the
self-signed-certificate warning. In the phone app, tap **Start** and grant motion and
location permission (and the camera, if you choose it as the background). Works in iOS
Safari and Android Chrome. (Hosted over real HTTPS, e.g. GitHub Pages, no certificate
warning appears.)

On a desktop browser (no motion sensors) the AR app falls back to drag-to-look /
scroll-to-zoom, which is handy for trying other locations via the manual lat/lon input.

## Two ways to look (phone app)

What is on screen must correspond to reality, so the phone app has no free "field of view":

- **Window** (default): the screen is a pane of glass. The view through it is fixed by the pane's
  physical size and its distance from your eye, nothing else (an off-axis pinhole: a ray from the
  eye through pane point (X, Y) is pixel (W/2 + kX, H/2 - kY), so F = k·ez). Screen size comes from
  a phone-model table, a credit-card calibration (hold a card upright on the screen and match the
  outline), or a typed diagonal. Eye distance is either assumed (hold it at ~40 cm) or measured by
  the front camera from the iris diameter (11.7 mm). The rear camera can show the floor behind the
  coastlines, digitally zoomed to the window's angle (approximate, since the lens is estimated);
  with a black background, head tracking stays live and gives parallax. Phones allow one camera at
  a time, so with the rear camera on, the face is measured once at start and then the cameras
  swap.
- **Camera AR**: the far side drawn with the rear camera's own lens geometry, so it registers on
  the camera image if that is the background. Much wider, but a web page cannot read a lens's
  field of view, so it is estimated per device (~68° across the image's long side on iPhone) and
  can be corrected under ⚙ if you know your lens. The overlay accounts for the
  `object-fit: cover` crop.

## What is behind the far side (phone app)

Either mode can show one of three backgrounds:

- **Space** (default): the real sky in the direction you point, as if the Earth were glass.
  The far side's land is drawn as a grey crust, lit where it is daytime there: the
  day/night terminator sweeps across it with the clock, so Australia is bright under New
  York's evening and dark under its noon. The sea is left clear, so the stars show through
  it. Beyond the crust lie the stars (Hipparcos, every star to magnitude 6, precessed to
  today), the constellation figures and names, the Sun, the Moon with its correct phase
  and orientation, and the five naked-eye planets. Stars are at infinity, so the direction
  from you through the rock to a star is the same as from the far side: pointing down at
  night you see the southern sky, and the Sun itself, which at night is under your feet.
  Only what the crust hides is hidden; the Moon can pass behind a continent.
- **Rear camera**: the floor (window mode, digitally zoomed to the window's angle) or the
  lens image (Camera AR).
- **Black**.

## Controls (⚙)

- **View**: which of the two modes is active and its parameters; "change" reopens setup.
- **Background**: space / rear camera / black, as above.
- **Camera opacity** (camera background): 0 gives a black background, often more legible.
- **Sky**: constellation lines and names on or off.
- **Clock**: adds up to ±24 h to the device clock; daylight on the far side and the whole
  sky follow it. Slide it to watch the terminator sweep across the crust.
- **Heading trim**: rotates the whole map about the vertical, for compass error.
- **Flip signs α/β/γ**: escape hatches for device-specific orientation sign bugs.
- **Location**: manual lat/lon (also for exploring other places), or re-query GPS.
- **Camera**: lens picker; the ultra-wide (0.5×) lens roughly doubles the visible Θ (Camera AR; set Lens FOV ≈ 106°).
- **Freeze** (❄): holds the last orientation so you can study the frame.
- **Run self-test**: the acceptance checks, runnable on the device itself.

## How it works

The far surface is ~12,742 km away, so walking around changes nothing: only
orientation matters, exactly like a star map. A far-side point at great-circle distance
Θ from your antipode is seen at nadir angle ν = Θ/2 (inscribed angle theorem), at
azimuth equal to the bearing from you to it. Per-vertex view directions are cached per
location; each frame only rotates them by the device orientation (W3C α/β/γ →
quaternion, slerp-smoothed with τ ≈ 0.15 s) and applies a pinhole projection.

Coastlines are Natural Earth 110m land polygons (public domain), Douglas-Peucker
simplified, quantized to 0.1°, delta/zigzag/base-41-varint encoded to ~9 KB of inline
text, and densified at load so no segment exceeds 0.25° (coarse segments near the
horizon would otherwise draw shortcuts across curved coastline).

The space background is a WebGL layer under the 2D overlay. Stars are unit vectors in the
catalogue frame; each frame one 3×3 matrix takes them to the equator of date (precession),
to east/north/up (sidereal time and your location) and to the device frame (the same
orientation quaternion as the coastlines), and the vertex shader applies the same pinhole,
with w = −z so GL clips what is behind the eye. The crust is a full-screen pass that runs
the view geometry backwards per pixel: a ray d in ENU reaches the far-side point
f = (1 − 2d_z²)·U − 2d_z·(d_x·E + d_y·N) (the inscribed-angle relation in closed form, no
trigonometry), whose lat/lon look up a land mask rasterised at load from the same
coastline rings, and whose dot product with the subsolar vector gives daylight. Sun by
Meeus (~0.01°), Moon and planets by Schlyter's series (~0.1°), the Moon corrected for
parallax; the Moon's phase is simply a sphere sprite lit by the Sun's direction in the
device frame. The ephemeris has self-tests against published worked examples.

Sky data: the Hipparcos catalogue (ESA 1997, CDS I/239), 5,044 stars to V = 6.0 plus the
few fainter stars a figure needs, proper motion applied to 2026.0, quantized to 0.005°
and varint-encoded to ~30 KB; constellation figures from Stellarium's modern sky culture
(CC BY-SA 4.0), as chains of star indices, ~3 KB.

Note the view is deliberately left-right mirrored relative to a wall map: you are
reading the far surface from the inside. Perth lies northeast of New York's antipode
but appears to the *west* on screen. That is correct.

## Development

- `tools/build_data.py <ne_110m_land.geojson> <outdir>`: regenerates the encoded
  coastline string (and re-verifies the projection against the spec's acceptance
  table). Source data: https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_land.geojson
- `tools/build_sky.py <hip_main.dat> <stellarium modern index.json> <outdir>`: regenerates
  the encoded star catalogue and constellation figures (and `test/sky_reference.json`).
  Sources: https://cdsarc.cds.unistra.fr/ftp/I/239/hip_main.dat and
  https://raw.githubusercontent.com/Stellarium/stellarium/master/skycultures/modern/index.json
- `node test/core-test.mjs`: runs the phone app's own self-test suite (geometry, data
  decoding, ephemeris against Meeus's and Schlyter's worked examples) plus a deep
  round-trip of the inline coastline and sky data against the Python reference decodes.
- `node test/dom-smoke.mjs`: loads the full app under a stub DOM (no WebGL), presses Start,
  feeds synthetic GPS + orientation events, and checks what got drawn. The space background
  itself is checked by eye: serve the folder and load `ar/` in a desktop browser, set a
  location under ⚙ and drag to look around.
