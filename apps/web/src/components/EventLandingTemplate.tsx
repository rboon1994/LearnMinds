'use client';

import { useEffect, useRef, useState } from 'react';
import type { LandingContent } from '@/lib/eventLandingContent';
import styles from './EventLandingTemplate.module.css';

// Testimonial/gallery photos and the hero photo are all arbitrary admin-pasted URLs (same
// convention as Event.thumbnail elsewhere in this app) — next/image's optimizer throws for any
// external hostname not allow-listed in next.config.js, so every image here is a plain <img>,
// matching SessionCard.tsx's existing precedent for the exact same reason.
/* eslint-disable @next/next/no-img-element */

export function EventLandingTemplate({ content }: { content: LandingContent }) {
  const [openVideo, setOpenVideo] = useState<{ embedUrl: string } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Ports the source HTML's scroll-fade-in behavior (IntersectionObserver + a staggered
  // transitionDelay), scoped to this component's own root so it can never affect unrelated
  // elements elsewhere on the page.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const revealEls = Array.from(container.querySelectorAll<HTMLElement>(`.${styles.reveal}`));
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add(styles.in);
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12 },
    );
    revealEls.forEach((el, i) => {
      el.style.transitionDelay = `${(i % 3) * 0.08}s`;
      observer.observe(el);
    });
    return () => observer.disconnect();
  }, [content]);

  // Ports the source HTML's Escape-to-close + background-scroll-lock behavior for the
  // testimonial video lightbox, driven by React state instead of vanilla-JS DOM toggling.
  useEffect(() => {
    if (!openVideo) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpenVideo(null);
    };
    document.addEventListener('keydown', onKeyDown);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = '';
    };
  }, [openVideo]);

  return (
    <div className={styles.page} ref={containerRef}>
      <div className={styles.blobs}>
        <div className={`${styles.blob} ${styles.blob1}`} />
        <div className={`${styles.blob} ${styles.blob2}`} />
        <div className={`${styles.blob} ${styles.blob3}`} />
      </div>
      <div className={styles.gridtex} />

      <header className={styles.header}>
        <div className={`${styles.wrap} ${styles.nav}`}>
          <div className={styles['logo-img']} role="img" aria-label="Prominds" />
        </div>
      </header>

      <div className={styles.hero} id="instructor">
        <div className={`${styles.wrap} ${styles['hero-grid']}`}>
          <div>
            <span className={styles.eyebrow}>你的导师</span>
            <h1>{content.hero.name}</h1>
            <div className={styles.role}>{content.hero.title}</div>
            <div className={styles.creds}>
              {content.hero.credentials.map((credential, i) => (
                <div className={styles.cred} key={i}>
                  <div className={styles.ck}>✓</div>
                  <p>{credential}</p>
                </div>
              ))}
            </div>
          </div>
          <div className={styles['hero-visual']}>
            <div className={styles['hero-glow']} />
            <div className={`${styles.ring} ${styles.ring1}`} />
            <div className={`${styles.ring} ${styles.ring2}`} />
            <div className={styles['portrait-wrap']}>
              {content.hero.photoUrl && (
                <img src={content.hero.photoUrl} alt={content.hero.name} className={styles['hero-figure']} />
              )}
            </div>
          </div>
        </div>
      </div>

      {content.course.days.length > 0 && (
        <section className={styles.blk} id="content">
          <div className={styles.wrap}>
            <span className={styles.eyebrow}>课程内容</span>
            <h2 className={styles.h2}>{content.course.title}</h2>
            <p className={styles.lead}>{content.course.subtitle}</p>

            {content.course.days.map((day, i) => (
              <div className={`${styles.day} ${styles.reveal}`} key={i}>
                <div className={styles['day-badge']}>
                  <div className={styles.d}>
                    DAY
                    <small>{i + 1}</small>
                  </div>
                </div>
                <div className={styles['day-body']}>
                  <h3>{day.title}</h3>
                  <div className={styles.theme}>{day.theme}</div>
                  <div className={styles['day-list']}>
                    {day.points.map((point, j) => (
                      <div className={styles.li} key={j}>
                        {point}
                      </div>
                    ))}
                  </div>
                  <div className={styles['take-out']}>
                    ✦ 当天带走：<b>{day.takeaway}</b>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {content.testimonials.length > 0 && (
        <section className={styles.blk} id="testimonial">
          <div className={`${styles.wrap} ${styles.center}`}>
            <span className={styles.eyebrow}>学员见证</span>
            <h2 className={styles.h2}>他们已经把 AI 用起来了</h2>
            <p className={styles.lead}>来自真实学员的分享——不只是感想，而是回到公司真的跑起来的成果。</p>
            <div className={styles['tm-grid']}>
              {content.testimonials.map((testimonial, i) => (
                <div className={`${styles.tm} ${styles.reveal}`} key={i}>
                  <button
                    type="button"
                    className={styles['tm-cover']}
                    onClick={() => setOpenVideo({ embedUrl: testimonial.embedUrl })}
                  >
                    <img src={testimonial.thumbnailUrl} alt={testimonial.name} />
                    <span className={styles.play}>▶</span>
                  </button>
                  <div className={styles['tm-body']}>
                    <div className={styles['tm-name']}>
                      {testimonial.name} <span className={styles['tm-role']}>· {testimonial.role}</span>
                    </div>
                    <p className={styles['tm-quote']}>「{testimonial.quote}」</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {content.gallery.length > 0 && (
        <section className={styles.blk} id="gallery">
          <div className={`${styles.wrap} ${styles.center}`}>
            <span className={styles.eyebrow}>现场实录</span>
            <h2 className={styles.h2}>课堂现场 · 学员大合照</h2>
            <p className={styles.lead}>来自线下课堂的真实现场。</p>
            <div className={styles['gal-mosaic']}>
              {content.gallery.map((url, i) => (
                <figure className={`${styles.gal} ${i === 0 ? styles['gal-main'] : ''}`} key={i}>
                  <img src={url} alt="活动现场照片" loading="lazy" />
                </figure>
              ))}
            </div>
          </div>
        </section>
      )}

      <footer className={styles.footer}>
        <div className={`${styles.wrap} ${styles.foot}`}>
          <div className={styles['logo-img']} role="img" aria-label="Prominds" />
          <div className={styles.tag}>We Are ProMinds. We Inspire More Lives.</div>
          <div className={styles.cc}>© Prominds Academy. All Rights Reserved.</div>
        </div>
      </footer>

      {openVideo && (
        <div
          className={`${styles.lb} ${styles.on}`}
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpenVideo(null);
          }}
        >
          <div className={styles['lb-x']} onClick={() => setOpenVideo(null)}>
            ✕
          </div>
          <div className={styles['lb-box']}>
            <iframe
              src={openVideo.embedUrl}
              allow="autoplay; encrypted-media; fullscreen"
              allowFullScreen
            />
          </div>
        </div>
      )}
    </div>
  );
}
