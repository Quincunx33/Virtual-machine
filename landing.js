(function () {
    function initMobileNav() {
        const toggleBtn = document.getElementById('mobile-menu-toggle');
        const mobileMenu = document.getElementById('mobile-menu');
        const nav = toggleBtn ? toggleBtn.closest('nav') : null;
        if (!toggleBtn || !mobileMenu) return;

        const icon = toggleBtn.querySelector('i');

        function setMenuOpen(isOpen) {
            mobileMenu.classList.toggle('hidden', !isOpen);
            toggleBtn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
            if (icon) {
                icon.classList.toggle('fa-bars', !isOpen);
                icon.classList.toggle('fa-times', isOpen);
            }
        }

        toggleBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const isCurrentlyHidden = mobileMenu.classList.contains('hidden');
            setMenuOpen(isCurrentlyHidden);
        });

        mobileMenu.querySelectorAll('a').forEach((link) => {
            link.addEventListener('click', () => setMenuOpen(false));
        });

        document.addEventListener('click', (e) => {
            if (!mobileMenu.classList.contains('hidden') && nav && !nav.contains(e.target)) {
                setMenuOpen(false);
            }
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && !mobileMenu.classList.contains('hidden')) {
                setMenuOpen(false);
            }
        });
    }

    const VISITOR_API_URL = 'https://viscount-inzm9sse.manus.space/api/v1/counter/quincunx33';
    const VISITOR_CACHE_KEY = 'webvm_visitor_count';

    function renderVisitorCount(countEl, containerEl, total) {
        const formatted = total.toLocaleString('en-US');
        if (containerEl) {
            containerEl.setAttribute('aria-label', `Total visitors: ${formatted}`);
        }

        const prefersReducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (prefersReducedMotion || total === 0) {
            countEl.textContent = formatted;
            return;
        }

        const startValue = Math.max(0, total - Math.min(total, 80));
        const duration = 500;
        const startTime = performance.now();

        function step(now) {
            const progress = Math.min(1, (now - startTime) / duration);
            const eased = 1 - Math.pow(1 - progress, 3);
            const current = Math.round(startValue + (total - startValue) * eased);
            countEl.textContent = current.toLocaleString('en-US');
            if (progress < 1) {
                requestAnimationFrame(step);
            } else {
                countEl.textContent = formatted;
            }
        }

        requestAnimationFrame(step);
    }

    async function initVisitorCounter() {
        const countEl = document.getElementById('visitor-count');
        const containerEl = document.getElementById('visitor-counter');
        if (!countEl) return;

        try {
            const response = await fetch(VISITOR_API_URL, {
                method: 'GET',
                cache: 'no-store',
                headers: { Accept: 'application/json' },
            });
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            const data = await response.json();
            const total = Number.parseInt(String(data && data.total !== undefined ? data.total : ''), 10);
            if (!Number.isFinite(total) || total < 0) {
                throw new Error('Invalid visitor count payload');
            }
            try {
                localStorage.setItem(VISITOR_CACHE_KEY, String(total));
            } catch (_) {}
            renderVisitorCount(countEl, containerEl, total);
        } catch (_) {
            let fallback = null;
            try {
                const cached = localStorage.getItem(VISITOR_CACHE_KEY);
                if (cached !== null) {
                    const parsed = Number.parseInt(cached, 10);
                    if (Number.isFinite(parsed) && parsed >= 0) {
                        fallback = parsed;
                    }
                }
            } catch (_) {}

            if (fallback !== null) {
                const formatted = fallback.toLocaleString('en-US');
                countEl.textContent = formatted;
                if (containerEl) {
                    containerEl.setAttribute('aria-label', `Total visitors: ${formatted}`);
                }
            } else {
                countEl.textContent = '—';
            }
        }
    }

    function prefersReducedMotion() {
        return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    }

    function initScrollProgress() {
        const bar = document.getElementById('scroll-progress');
        const nav = document.getElementById('main-nav');
        if (!bar && !nav) return;

        let ticking = false;

        function update() {
            ticking = false;
            const scrollTop = window.scrollY || window.pageYOffset || 0;
            if (nav) {
                nav.classList.toggle('nav-scrolled', scrollTop > 16);
            }
            if (bar) {
                const docHeight = document.documentElement.scrollHeight - window.innerHeight;
                const ratio = docHeight > 0 ? Math.min(1, Math.max(0, scrollTop / docHeight)) : 0;
                bar.style.transform = `scaleX(${ratio})`;
            }
        }

        function onScroll() {
            if (!ticking) {
                ticking = true;
                requestAnimationFrame(update);
            }
        }

        window.addEventListener('scroll', onScroll, { passive: true });
        window.addEventListener('resize', onScroll, { passive: true });
        update();
    }

    function initScrollReveals() {
        const targets = Array.from(document.querySelectorAll('[data-reveal]'));
        if (!targets.length) return;

        if (prefersReducedMotion() || !('IntersectionObserver' in window)) {
            targets.forEach((el) => el.classList.add('is-visible'));
            return;
        }

        document.documentElement.classList.add('reveal-init');

        const observer = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    if (entry.isIntersecting) {
                        entry.target.classList.add('is-visible');
                        observer.unobserve(entry.target);
                    }
                });
            },
            { threshold: 0.12, rootMargin: '0px 0px -36px 0px' }
        );

        const viewH = window.innerHeight || document.documentElement.clientHeight;
        targets.forEach((el) => {
            const rect = el.getBoundingClientRect();
            if (rect.top < viewH * 0.92) {
                el.classList.add('is-visible');
            } else {
                observer.observe(el);
            }
        });
    }

    function initHeroParallax() {
        const stage = document.getElementById('hero-stage');
        const card = document.getElementById('hero-tilt-card');
        if (!stage || !card || prefersReducedMotion()) return;
        if (window.matchMedia && !window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;

        const base = { x: 8, y: -8, z: 1.5, scale: 1 };
        let target = { ...base };
        let current = { ...base };
        let rafId = null;

        function animateTilt() {
            current.x += (target.x - current.x) * 0.14;
            current.y += (target.y - current.y) * 0.14;
            current.z += (target.z - current.z) * 0.14;
            current.scale += (target.scale - current.scale) * 0.14;

            card.style.setProperty('--tilt-x', `${current.x.toFixed(2)}deg`);
            card.style.setProperty('--tilt-y', `${current.y.toFixed(2)}deg`);
            card.style.setProperty('--tilt-z', `${current.z.toFixed(2)}deg`);
            card.style.setProperty('--tilt-scale', current.scale.toFixed(4));

            const done =
                Math.abs(target.x - current.x) < 0.03 &&
                Math.abs(target.y - current.y) < 0.03 &&
                Math.abs(target.z - current.z) < 0.03 &&
                Math.abs(target.scale - current.scale) < 0.001;

            if (!done) {
                rafId = requestAnimationFrame(animateTilt);
            } else {
                rafId = null;
                if (target.scale === 1) {
                    card.classList.remove('is-tilting');
                }
            }
        }

        function schedule() {
            if (!rafId) {
                rafId = requestAnimationFrame(animateTilt);
            }
        }

        stage.addEventListener('pointermove', (e) => {
            const rect = stage.getBoundingClientRect();
            const nx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
            const ny = ((e.clientY - rect.top) / rect.height) * 2 - 1;
            card.classList.add('is-tilting');
            target = {
                x: -ny * 9,
                y: nx * 11,
                z: nx * 0.8,
                scale: 1.02,
            };
            schedule();
        });

        stage.addEventListener('pointerleave', () => {
            target = { ...base };
            schedule();
        });
    }

    function initTerminalBootReplay() {
        const replayBtn = document.getElementById('hero-terminal-replay');
        const body = document.getElementById('hero-terminal-body');
        if (!replayBtn || !body) return;

        replayBtn.addEventListener('click', () => {
            const animated = body.querySelectorAll('.boot-line, .boot-card-in');
            animated.forEach((el) => {
                el.style.animation = 'none';
            });
            void body.offsetWidth;
            animated.forEach((el) => {
                el.style.animation = '';
            });
        });
    }

    function initFaqAccordions() {
        const items = document.querySelectorAll('#faq details');
        if (!items.length || prefersReducedMotion()) return;

        items.forEach((details) => {
            const summary = details.querySelector('summary');
            const content = details.querySelector('div');
            if (!summary || !content || typeof content.animate !== 'function') return;

            let anim = null;

            summary.addEventListener('click', (e) => {
                e.preventDefault();
                if (anim) {
                    anim.cancel();
                    anim = null;
                }

                if (details.open) {
                    const startH = content.offsetHeight;
                    content.style.overflow = 'hidden';
                    anim = content.animate(
                        [
                            { height: `${startH}px`, opacity: 1 },
                            { height: '0px', opacity: 0 },
                        ],
                        { duration: 220, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' }
                    );
                    anim.onfinish = () => {
                        details.open = false;
                        content.style.overflow = '';
                        anim = null;
                    };
                    anim.oncancel = () => {
                        content.style.overflow = '';
                        anim = null;
                    };
                } else {
                    details.open = true;
                    const endH = content.offsetHeight;
                    content.style.overflow = 'hidden';
                    anim = content.animate(
                        [
                            { height: '0px', opacity: 0 },
                            { height: `${endH}px`, opacity: 1 },
                        ],
                        { duration: 260, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' }
                    );
                    anim.onfinish = () => {
                        content.style.overflow = '';
                        anim = null;
                    };
                    anim.oncancel = () => {
                        content.style.overflow = '';
                        anim = null;
                    };
                }
            });
        });
    }

    function initLanding() {
        initMobileNav();
        initScrollProgress();
        initScrollReveals();
        initHeroParallax();
        initTerminalBootReplay();
        initFaqAccordions();
        initVisitorCounter();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initLanding, { once: true });
    } else {
        initLanding();
    }

    if ('serviceWorker' in navigator && localStorage.getItem('webvm_offline_cache') !== 'false') {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('./sw.js').catch((err) => {
                console.log('SW registration note:', err);
            });
        });
    }
})();
