// Loop signup flow screens — 7 frames covering Welcome → Phone → Verify →
// Profile → Location → Payment → Ready.
//
// Colors / type come from props (t = tweaks, p = resolved palette). Each
// screen is a self-contained vertical layout meant to fill an iPhone-sized
// frame; the parent (index.jsx) wraps them in <IOSDevice>.
import React from 'react';

const FONT = '-apple-system, "SF Pro Display", "SF Pro Text", system-ui, sans-serif';

// ── Shared bits ──────────────────────────────────────────────────────────────
function LoopMark({ size = 48, color, accent }) {
  // Two overlapping rings = "loop" + bike wheels. Geometric only.
  const s = size,
    r = size * 0.32,
    sw = size * 0.11;
  return (
    <svg width={s} height={s * 0.62} viewBox={`0 0 ${s} ${s * 0.62}`}>
      <circle cx={r + sw / 2} cy={s * 0.31} r={r} fill="none" stroke={color} strokeWidth={sw} />
      <circle
        cx={s - r - sw / 2}
        cy={s * 0.31}
        r={r}
        fill="none"
        stroke={accent}
        strokeWidth={sw}
      />
    </svg>
  );
}

function PrimaryButton({ children, color, textColor = '#fff', glow = true, style = {} }) {
  return (
    <button
      style={{
        width: '100%',
        height: 54,
        borderRadius: 16,
        background: color,
        color: textColor,
        border: 'none',
        fontFamily: FONT,
        fontSize: 17,
        fontWeight: 600,
        letterSpacing: -0.2,
        cursor: 'pointer',
        boxShadow: glow ? `0 8px 20px ${color}33` : 'none',
        ...style,
      }}
    >
      {children}
    </button>
  );
}

function GhostButton({ children, ink, style = {} }) {
  return (
    <button
      style={{
        width: '100%',
        height: 54,
        borderRadius: 16,
        background: 'transparent',
        color: ink,
        border: 'none',
        fontFamily: FONT,
        fontSize: 17,
        fontWeight: 500,
        letterSpacing: -0.2,
        cursor: 'pointer',
        ...style,
      }}
    >
      {children}
    </button>
  );
}

function StepDots({ step, total = 5, color }) {
  return (
    <div style={{ display: 'flex', gap: 6, padding: '0 24px' }}>
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          style={{
            height: 4,
            flex: 1,
            borderRadius: 4,
            background: i < step ? color : 'rgba(11,16,32,0.08)',
            transition: 'background .2s',
          }}
        />
      ))}
    </div>
  );
}

function BackChevron({ ink, line }) {
  return (
    <div
      style={{
        width: 40,
        height: 40,
        borderRadius: 20,
        background: '#fff',
        border: `1px solid ${line}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <svg width="9" height="14" viewBox="0 0 9 14">
        <path
          d="M8 1 2 7l6 6"
          stroke={ink}
          strokeWidth="2"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}

function ScreenHeader({ step, total, p }) {
  return (
    <div style={{ paddingTop: 56, paddingBottom: 24 }}>
      <div style={{ padding: '0 24px 20px', display: 'flex' }}>
        <BackChevron ink={p.ink} line={p.line} />
      </div>
      <StepDots step={step} total={total} color={p.primary} />
    </div>
  );
}

function Field({ label, value, placeholder, prefix, focused = false, showCaret = false, p }) {
  return (
    <div>
      <div
        style={{
          fontFamily: FONT,
          fontSize: 13,
          fontWeight: 500,
          color: p.ink3,
          marginBottom: 8,
          letterSpacing: 0.2,
          textTransform: 'uppercase',
        }}
      >
        {label}
      </div>
      <div
        style={{
          height: 60,
          borderRadius: 16,
          background: p.card,
          border: `1.5px solid ${focused ? p.primary : p.line}`,
          padding: '0 18px',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          fontFamily: FONT,
          fontSize: 19,
          color: p.ink,
          boxShadow: focused ? `0 0 0 4px ${p.primary}1A` : 'none',
        }}
      >
        {prefix && <span style={{ color: p.ink3 }}>{prefix}</span>}
        <span style={{ flex: 1, color: value ? p.ink : p.ink3 }}>{value || placeholder}</span>
        {showCaret && (
          <div
            style={{
              width: 2,
              height: 24,
              background: p.primary,
              borderRadius: 1,
              animation: 'loopCaret 1s steps(2) infinite',
            }}
          />
        )}
      </div>
    </div>
  );
}

// ── Screen 1: Welcome ────────────────────────────────────────────────────────
export function WelcomeScreen({ p }) {
  return (
    <div
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: p.bg,
        fontFamily: FONT,
      }}
    >
      {/* Hero illustration area — abstract geometric */}
      <div
        style={{
          flex: 1,
          position: 'relative',
          overflow: 'hidden',
          background: `linear-gradient(160deg, ${p.primarySoft} 0%, ${p.bg} 70%)`,
        }}
      >
        {/* sun */}
        <div
          style={{
            position: 'absolute',
            top: 96,
            right: -40,
            width: 200,
            height: 200,
            borderRadius: '50%',
            background: p.accent,
            opacity: 0.92,
          }}
        />
        {/* road arc */}
        <div
          style={{
            position: 'absolute',
            bottom: -120,
            left: -60,
            right: -60,
            height: 240,
            borderRadius: '50%',
            background: p.ink,
            opacity: 0.92,
          }}
        />
        {/* wheel marks */}
        <div
          style={{
            position: 'absolute',
            bottom: 56,
            left: '50%',
            transform: 'translateX(-50%)',
            display: 'flex',
            gap: 36,
            alignItems: 'center',
          }}
        >
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: '50%',
              border: `7px solid #fff`,
              background: p.ink,
            }}
          />
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: '50%',
              border: `7px solid ${p.accent}`,
              background: p.ink,
            }}
          />
        </div>
        {/* brand mark top */}
        <div style={{ position: 'absolute', top: 70, left: 28 }}>
          <LoopMark size={42} color={p.primary} accent={p.accent} />
        </div>
      </div>

      {/* Copy + CTAs */}
      <div
        style={{
          background: p.bg,
          padding: '28px 24px 36px',
          borderRadius: '28px 28px 0 0',
          marginTop: -28,
          position: 'relative',
        }}
      >
        <div
          style={{
            fontSize: 36,
            fontWeight: 700,
            lineHeight: 1.05,
            color: p.ink,
            letterSpacing: -1.2,
            marginBottom: 12,
          }}
        >
          The city,
          <br />
          on two wheels.
        </div>
        <div
          style={{
            fontSize: 16,
            lineHeight: 1.45,
            color: p.ink2,
            marginBottom: 28,
            maxWidth: 300,
          }}
        >
          Unlock a bike in seconds. Pay by the minute. First ride is on us.
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <PrimaryButton color={p.primary}>Create account</PrimaryButton>
          <GhostButton ink={p.ink}>I already have an account</GhostButton>
        </div>
      </div>
    </div>
  );
}

// ── Screen 2: Phone ──────────────────────────────────────────────────────────
export function PhoneScreen({ p }) {
  return (
    <div
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: p.bg,
        fontFamily: FONT,
      }}
    >
      <ScreenHeader step={1} total={5} p={p} />
      <div style={{ padding: '24px 24px 0', flex: 1 }}>
        <div
          style={{
            fontSize: 30,
            fontWeight: 700,
            color: p.ink,
            letterSpacing: -0.8,
            lineHeight: 1.1,
            marginBottom: 10,
          }}
        >
          What&apos;s your number?
        </div>
        <div
          style={{
            fontSize: 15,
            color: p.ink2,
            lineHeight: 1.45,
            marginBottom: 32,
          }}
        >
          We&apos;ll text you a code to verify. No spam, ever.
        </div>

        <Field
          label="Mobile number"
          prefix="🇺🇸  +1"
          value="(415) 555-0142"
          focused
          showCaret
          p={p}
        />

        <div
          style={{
            marginTop: 20,
            padding: '14px 16px',
            background: p.primarySoft,
            borderRadius: 14,
            display: 'flex',
            gap: 10,
            alignItems: 'flex-start',
          }}
        >
          <div
            style={{
              width: 22,
              height: 22,
              borderRadius: '50%',
              background: p.primary,
              color: '#fff',
              fontSize: 13,
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            i
          </div>
          <div style={{ fontSize: 13, color: p.ink2, lineHeight: 1.4 }}>
            Standard messaging rates may apply. By continuing, you agree to our
            <span style={{ color: p.primary, fontWeight: 600 }}> Terms</span> and
            <span style={{ color: p.primary, fontWeight: 600 }}> Privacy Policy</span>.
          </div>
        </div>
      </div>
      <div style={{ padding: '0 24px 24px' }}>
        <PrimaryButton color={p.primary}>Send code →</PrimaryButton>
      </div>
    </div>
  );
}

// ── Screen 3: Verify ─────────────────────────────────────────────────────────
export function VerifyScreen({ p }) {
  const code = ['4', '8', '2', '1', '', ''];
  return (
    <div
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: p.bg,
        fontFamily: FONT,
      }}
    >
      <ScreenHeader step={2} total={5} p={p} />
      <div style={{ padding: '24px 24px 0', flex: 1 }}>
        <div
          style={{
            fontSize: 30,
            fontWeight: 700,
            color: p.ink,
            letterSpacing: -0.8,
            lineHeight: 1.1,
            marginBottom: 10,
          }}
        >
          Enter the code
        </div>
        <div
          style={{
            fontSize: 15,
            color: p.ink2,
            lineHeight: 1.45,
            marginBottom: 32,
          }}
        >
          Sent to <span style={{ color: p.ink, fontWeight: 600 }}>(415) 555-0142</span>.{' '}
          <span style={{ color: p.primary, fontWeight: 600 }}>Change</span>
        </div>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'space-between' }}>
          {code.map((d, i) => {
            const filled = !!d;
            const active = i === 4;
            return (
              <div
                key={i}
                style={{
                  flex: 1,
                  height: 64,
                  borderRadius: 16,
                  background: p.card,
                  border: `2px solid ${active ? p.primary : filled ? p.ink : p.line}`,
                  boxShadow: active ? `0 0 0 4px ${p.primary}1A` : 'none',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 28,
                  fontWeight: 600,
                  color: p.ink,
                  fontFamily: FONT,
                }}
              >
                {d ||
                  (active && (
                    <div
                      style={{
                        width: 2,
                        height: 28,
                        background: p.primary,
                        borderRadius: 1,
                        animation: 'loopCaret 1s steps(2) infinite',
                      }}
                    />
                  ))}
              </div>
            );
          })}
        </div>

        <div
          style={{
            marginTop: 28,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: 14,
            color: p.ink2,
          }}
        >
          <span>
            Resend in <span style={{ color: p.ink, fontWeight: 600 }}>0:24</span>
          </span>
          <span style={{ color: p.ink3, fontWeight: 500 }}>Resend code</span>
        </div>
      </div>
    </div>
  );
}

// ── Screen 4: Profile ────────────────────────────────────────────────────────
export function ProfileScreen({ p }) {
  return (
    <div
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: p.bg,
        fontFamily: FONT,
      }}
    >
      <ScreenHeader step={3} total={5} p={p} />
      <div style={{ padding: '24px 24px 0', flex: 1, overflow: 'auto' }}>
        <div
          style={{
            fontSize: 30,
            fontWeight: 700,
            color: p.ink,
            letterSpacing: -0.8,
            lineHeight: 1.1,
            marginBottom: 10,
          }}
        >
          About you
        </div>
        <div
          style={{
            fontSize: 15,
            color: p.ink2,
            lineHeight: 1.45,
            marginBottom: 28,
          }}
        >
          This is how we&apos;ll greet you when you unlock a bike.
        </div>

        {/* Avatar uploader */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 16,
            marginBottom: 28,
            padding: '14px 14px 14px 14px',
            background: p.card,
            borderRadius: 18,
            border: `1px solid ${p.line}`,
          }}
        >
          <div
            style={{
              width: 60,
              height: 60,
              borderRadius: '50%',
              background: `linear-gradient(135deg, ${p.accent} 0%, ${p.primary} 100%)`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff',
              fontSize: 22,
              fontWeight: 700,
            }}
          >
            M
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: p.ink }}>Add a photo</div>
            <div style={{ fontSize: 13, color: p.ink3, marginTop: 2 }}>
              Optional · helps station staff
            </div>
          </div>
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 12,
              background: p.primarySoft,
              color: p.primary,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 22,
              fontWeight: 400,
            }}
          >
            +
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Field label="First name" value="Maya" focused p={p} />
          <Field label="Last name" value="Castellanos" p={p} />
          <Field label="Email" value="maya.c@hey.com" p={p} />
        </div>
      </div>
      <div style={{ padding: '20px 24px 24px' }}>
        <PrimaryButton color={p.primary}>Continue</PrimaryButton>
      </div>
    </div>
  );
}

// ── Screen 5: Location permission ────────────────────────────────────────────
export function LocationScreen({ p }) {
  return (
    <div
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: p.bg,
        fontFamily: FONT,
      }}
    >
      <ScreenHeader step={4} total={5} p={p} />

      {/* Map preview */}
      <div style={{ padding: '8px 24px 0' }}>
        <div
          style={{
            height: 220,
            borderRadius: 24,
            overflow: 'hidden',
            position: 'relative',
            background: `repeating-linear-gradient(45deg, ${p.primarySoft} 0 8px, #DEE5FF 8px 16px)`,
            border: `1px solid ${p.line}`,
          }}
        >
          {/* roads */}
          <div
            style={{
              position: 'absolute',
              top: 70,
              left: -10,
              right: -10,
              height: 18,
              background: '#fff',
            }}
          />
          <div
            style={{
              position: 'absolute',
              top: 150,
              left: -10,
              right: -10,
              height: 18,
              background: '#fff',
            }}
          />
          <div
            style={{
              position: 'absolute',
              top: -10,
              bottom: -10,
              left: 90,
              width: 18,
              background: '#fff',
            }}
          />
          <div
            style={{
              position: 'absolute',
              top: -10,
              bottom: -10,
              left: 220,
              width: 18,
              background: '#fff',
            }}
          />
          {/* pin */}
          <div
            style={{
              position: 'absolute',
              top: 78,
              left: '50%',
              transform: 'translateX(-50%)',
            }}
          >
            <div
              style={{
                width: 64,
                height: 64,
                borderRadius: '50%',
                background: `${p.primary}33`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <div
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: '50%',
                  background: p.primary,
                  border: '4px solid #fff',
                  boxShadow: `0 4px 12px ${p.primary}66`,
                }}
              />
            </div>
          </div>
          {/* nearby bike pins */}
          <div
            style={{
              position: 'absolute',
              top: 50,
              right: 40,
              width: 26,
              height: 26,
              borderRadius: '50% 50% 50% 0',
              background: p.accent,
              transform: 'rotate(-45deg)',
              boxShadow: '0 3px 8px rgba(0,0,0,0.15)',
            }}
          />
          <div
            style={{
              position: 'absolute',
              bottom: 30,
              left: 40,
              width: 26,
              height: 26,
              borderRadius: '50% 50% 50% 0',
              background: p.accent,
              transform: 'rotate(-45deg)',
              boxShadow: '0 3px 8px rgba(0,0,0,0.15)',
            }}
          />
        </div>
      </div>

      <div style={{ padding: '28px 24px 0', flex: 1 }}>
        <div
          style={{
            fontSize: 28,
            fontWeight: 700,
            color: p.ink,
            letterSpacing: -0.8,
            lineHeight: 1.1,
            marginBottom: 10,
          }}
        >
          Find bikes near you
        </div>
        <div
          style={{
            fontSize: 15,
            color: p.ink2,
            lineHeight: 1.5,
          }}
        >
          Loop uses your location to show available bikes and open docks. We never track you when
          the app is closed.
        </div>
      </div>

      <div style={{ padding: '0 24px 24px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <PrimaryButton color={p.primary}>Allow location</PrimaryButton>
        <GhostButton ink={p.ink}>Not now</GhostButton>
      </div>
    </div>
  );
}

// ── Screen 6: Payment ────────────────────────────────────────────────────────
export function PaymentScreen({ p }) {
  return (
    <div
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: p.bg,
        fontFamily: FONT,
      }}
    >
      <ScreenHeader step={5} total={5} p={p} />
      <div style={{ padding: '24px 24px 0', flex: 1 }}>
        <div
          style={{
            fontSize: 30,
            fontWeight: 700,
            color: p.ink,
            letterSpacing: -0.8,
            lineHeight: 1.1,
            marginBottom: 10,
          }}
        >
          Add a payment method
        </div>
        <div
          style={{
            fontSize: 15,
            color: p.ink2,
            lineHeight: 1.45,
            marginBottom: 24,
          }}
        >
          We only charge when you ride.{' '}
          <span style={{ color: p.accent, fontWeight: 600 }}>Your first ride is free.</span>
        </div>

        {/* Apple Pay */}
        <div
          style={{
            height: 64,
            borderRadius: 16,
            background: p.ink,
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            fontFamily: FONT,
            fontSize: 22,
            fontWeight: 500,
            marginBottom: 16,
            letterSpacing: -0.3,
          }}
        >
          <svg width="18" height="22" viewBox="0 0 18 22" fill="#fff" aria-hidden>
            <path d="M14.7 11.6c0-2.6 2.1-3.9 2.2-4-1.2-1.8-3.1-2-3.7-2-1.6-.2-3.1.9-3.9.9-.8 0-2.1-.9-3.4-.9-1.8 0-3.4 1-4.3 2.6-1.8 3.2-.5 7.8 1.3 10.4.9 1.3 1.9 2.7 3.3 2.6 1.3-.1 1.8-.9 3.4-.9s2 .9 3.4.8c1.4 0 2.3-1.3 3.2-2.6 1-1.5 1.4-2.9 1.4-3-.1 0-2.7-1-2.7-3.9zM12.4 4.1c.7-.9 1.2-2.1 1-3.3-1 0-2.3.7-3 1.5-.7.8-1.3 2-1.1 3.2 1.2.1 2.4-.6 3.1-1.4z" />
          </svg>
          <span style={{ fontWeight: 500 }}>Pay</span>
        </div>

        {/* OR divider */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            margin: '4px 0 16px',
            color: p.ink3,
            fontSize: 13,
            fontWeight: 500,
          }}
        >
          <div style={{ flex: 1, height: 1, background: p.line }} />
          <span>or pay by card</span>
          <div style={{ flex: 1, height: 1, background: p.line }} />
        </div>

        {/* Card field */}
        <div
          style={{
            background: p.card,
            borderRadius: 18,
            border: `1px solid ${p.line}`,
            padding: 4,
          }}
        >
          <div
            style={{
              padding: '16px 18px',
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              borderBottom: `1px solid ${p.line}`,
            }}
          >
            <div
              style={{
                width: 34,
                height: 24,
                borderRadius: 5,
                background: `linear-gradient(135deg, ${p.primary}, ${p.primaryDeep})`,
              }}
            />
            <span style={{ flex: 1, fontSize: 17, color: p.ink3 }}>Card number</span>
          </div>
          <div style={{ display: 'flex' }}>
            <div
              style={{
                flex: 1,
                padding: '16px 18px',
                borderRight: `1px solid ${p.line}`,
                fontSize: 17,
                color: p.ink3,
              }}
            >
              MM / YY
            </div>
            <div style={{ flex: 1, padding: '16px 18px', fontSize: 17, color: p.ink3 }}>CVC</div>
          </div>
        </div>

        <div
          style={{
            marginTop: 20,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontSize: 13,
            color: p.ink2,
          }}
        >
          <div
            style={{
              width: 16,
              height: 16,
              borderRadius: 4,
              background: p.primary,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff',
              fontSize: 11,
              fontWeight: 700,
            }}
          >
            ✓
          </div>
          Encrypted end-to-end. We never store your CVC.
        </div>
      </div>
      <div style={{ padding: '20px 24px 24px' }}>
        <PrimaryButton color={p.primary}>Add payment method</PrimaryButton>
      </div>
    </div>
  );
}

// ── Screen 7: Success ────────────────────────────────────────────────────────
export function ReadyScreen({ p }) {
  return (
    <div
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: FONT,
        background: `linear-gradient(180deg, ${p.primary} 0%, ${p.primaryDeep} 100%)`,
        color: '#fff',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* decorative accent burst */}
      <div
        style={{
          position: 'absolute',
          top: -100,
          right: -100,
          width: 280,
          height: 280,
          borderRadius: '50%',
          background: p.accent,
          opacity: 0.18,
        }}
      />
      <div
        style={{
          position: 'absolute',
          top: -60,
          right: -60,
          width: 180,
          height: 180,
          borderRadius: '50%',
          background: p.accent,
          opacity: 0.22,
        }}
      />

      <div style={{ padding: '90px 24px 0', flex: 1, position: 'relative' }}>
        {/* Big check / accent disc */}
        <div
          style={{
            width: 96,
            height: 96,
            borderRadius: '50%',
            background: p.accent,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 32,
            boxShadow: `0 12px 40px ${p.accent}59`,
          }}
        >
          <svg width="44" height="32" viewBox="0 0 44 32">
            <path
              d="M4 16 L17 28 L40 4"
              stroke="#fff"
              strokeWidth="5"
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>

        <div
          style={{
            fontSize: 38,
            fontWeight: 700,
            letterSpacing: -1.2,
            lineHeight: 1.05,
            marginBottom: 14,
          }}
        >
          You&apos;re in,
          <br />
          Maya.
        </div>
        <div
          style={{
            fontSize: 16,
            lineHeight: 1.5,
            opacity: 0.85,
            marginBottom: 28,
            maxWidth: 300,
          }}
        >
          Your account is ready. There are <b style={{ color: p.accent }}>14 bikes</b> within a
          3-minute walk.
        </div>

        {/* Free ride card */}
        <div
          style={{
            background: 'rgba(255,255,255,0.1)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            border: '1px solid rgba(255,255,255,0.2)',
            borderRadius: 18,
            padding: '16px 18px',
            display: 'flex',
            alignItems: 'center',
            gap: 14,
          }}
        >
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 12,
              background: p.accent,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 22,
              fontWeight: 700,
            }}
          >
            ★
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 600 }}>First ride free</div>
            <div style={{ fontSize: 13, opacity: 0.75 }}>
              Applied to your next unlock · up to 30 min
            </div>
          </div>
        </div>
      </div>

      <div style={{ padding: '0 24px 24px' }}>
        <PrimaryButton color="#fff" textColor={p.primary} glow={false}>
          Find a bike
        </PrimaryButton>
      </div>
    </div>
  );
}
