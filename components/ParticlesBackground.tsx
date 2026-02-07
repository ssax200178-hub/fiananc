import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useAppContext } from '../AppContext';

const ParticlesBackground: React.FC = () => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const { particlesConfig, theme } = useAppContext();
    const mouseRef = useRef({ x: 0, y: 0 });

    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            // Camera Z is 1000, FOV 75.
            // Height at Z=0 is approx 1530 units.
            // Map screen coords to World coords at Z=0
            const vFOV = 75 * Math.PI / 180;
            const height = 2 * Math.tan(vFOV / 2) * 1000;
            const width = height * (window.innerWidth / window.innerHeight);

            mouseRef.current = {
                x: (e.clientX / window.innerWidth - 0.5) * width,
                y: -(e.clientY / window.innerHeight - 0.5) * height
            };
        };

        window.addEventListener('mousemove', handleMouseMove);
        return () => window.removeEventListener('mousemove', handleMouseMove);
    }, []);

    useEffect(() => {
        if (!particlesConfig.enabled || !canvasRef.current) return;

        const canvas = canvasRef.current;
        const scene = new THREE.Scene();
        // Reduced fog density to make particles clearer
        scene.fog = new THREE.FogExp2(theme === 'dark' ? 0x000000 : 0xf5f5f5, 0.0005);

        const camera = new THREE.PerspectiveCamera(
            75,
            window.innerWidth / window.innerHeight,
            1,
            2000
        );
        camera.position.z = 1000;

        const renderer = new THREE.WebGLRenderer({
            canvas,
            antialias: true,
            alpha: true
        });
        renderer.setPixelRatio(window.devicePixelRatio);
        renderer.setSize(window.innerWidth, window.innerHeight);

        // Helper to create texture for a specific symbol
        const createSymbolTexture = (symbol: string, type: 'text' | 'circle' = 'text') => {
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = 64;
            tempCanvas.height = 64;
            const ctx = tempCanvas.getContext('2d')!;

            ctx.clearRect(0, 0, 64, 64);

            // Color based on theme
            const color = theme === 'dark' ? '#4CAF50' : '#C62828';
            ctx.fillStyle = color;

            if (type === 'circle') {
                ctx.beginPath();
                ctx.arc(32, 32, 20, 0, Math.PI * 2);
                ctx.fill();
            } else {
                ctx.font = 'bold 48px Arial';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(symbol, 32, 32);
            }

            const texture = new THREE.CanvasTexture(tempCanvas);
            texture.needsUpdate = true;
            return texture;
        };

        const particlesGroup = new THREE.Group();
        scene.add(particlesGroup);

        // Prepare textures
        const textures: THREE.Texture[] = [];
        if (particlesConfig.type === 'all') {
            const symbols = ['$', '€', '£', '¥', '₹', '₽', '₩', '₺', '﷼', 'د.إ'];
            symbols.forEach(sym => textures.push(createSymbolTexture(sym)));
        } else if (particlesConfig.type === 'dollar') {
            textures.push(createSymbolTexture('$'));
        } else if (particlesConfig.type === 'stars') {
            textures.push(createSymbolTexture('⭐'));
        } else if (particlesConfig.type === 'circles') {
            textures.push(createSymbolTexture('', 'circle'));
        }

        // Create particles data structure
        const particlesData: {
            baseVelocity: THREE.Vector3,
            currentVelocity: THREE.Vector3,
            sprite: THREE.Sprite
        }[] = [];

        for (let i = 0; i < particlesConfig.count; i++) {
            // Assign random texture if multiple exist
            const texture = textures[Math.floor(Math.random() * textures.length)];

            const material = new THREE.SpriteMaterial({
                map: texture,
                transparent: true,
                opacity: 0.8,
                color: 0xffffff
            });

            const sprite = new THREE.Sprite(material);
            const x = Math.random() * 2000 - 1000;
            const y = Math.random() * 2000 - 1000;
            const z = Math.random() * 2000 - 1000;

            sprite.position.set(x, y, z);

            const scale = Math.random() * 30 + 10;
            sprite.scale.set(scale, scale, 1);

            particlesGroup.add(sprite);

            particlesData.push({
                baseVelocity: new THREE.Vector3(
                    (Math.random() - 0.5) * 2, // Faster base speed
                    (Math.random() - 0.5) * 2,
                    (Math.random() - 0.5) * 2
                ),
                currentVelocity: new THREE.Vector3(0, 0, 0),
                sprite: sprite
            });
        }

        // Animation loop
        let animationId: number;
        const animate = () => {
            animationId = requestAnimationFrame(animate);

            particlesGroup.rotation.y += 0.0005 * particlesConfig.speed;

            const mouseVec = new THREE.Vector3(mouseRef.current.x, mouseRef.current.y, 0);

            particlesData.forEach(data => {
                const particle = data.sprite;

                // 1. Base Ambient Motion
                particle.position.add(data.baseVelocity.clone().multiplyScalar(particlesConfig.speed * 0.5));

                // 2. Mouse Attraction Physics
                const dist = particle.position.distanceTo(mouseVec);
                const attractionRange = 900; // Even larger range for smoother transition

                if (dist < attractionRange) {
                    // Vector to mouse
                    const dir = mouseVec.clone().sub(particle.position);

                    // Normalize and scale by inverse distance
                    // Reduced base multiplier from 20 to 5 for much gentler movement
                    const strength = (1 - dist / attractionRange) * 5 * particlesConfig.speed * (particlesConfig.interactionStrength ?? 1);

                    dir.normalize().multiplyScalar(strength);

                    // Apply to current velocity (acceleration)
                    data.currentVelocity.add(dir);
                }

                // 3. Apply Physics Velocity
                particle.position.add(data.currentVelocity);

                // 4. Damping / Friction (increased from 0.92 to 0.88 for faster stabilization)
                data.currentVelocity.multiplyScalar(0.88);

                // Boundary check (wrap around)
                if (particle.position.x > 1500) particle.position.x = -1500;
                if (particle.position.x < -1500) particle.position.x = 1500;
                if (particle.position.y > 1500) particle.position.y = -1500;
                if (particle.position.y < -1500) particle.position.y = 1500;
                if (particle.position.z > 1000) particle.position.z = -1000;
                if (particle.position.z < -1000) particle.position.z = 1000;
            });

            renderer.render(scene, camera);
        };

        animate();

        // Handle resize
        const handleResize = () => {
            camera.aspect = window.innerWidth / window.innerHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(window.innerWidth, window.innerHeight);
        };

        window.addEventListener('resize', handleResize);

        // Cleanup
        return () => {
            window.removeEventListener('resize', handleResize);
            cancelAnimationFrame(animationId);
            renderer.dispose();
            textures.forEach(t => t.dispose());
            particlesData.forEach(d => {
                if (d.sprite.material) {
                    (d.sprite.material as THREE.SpriteMaterial).dispose();
                }
            });
        };
    }, [particlesConfig, theme]);

    if (!particlesConfig.enabled) return null;

    return (
        <canvas
            ref={canvasRef}
            className="fixed inset-0 pointer-events-none z-0"
            style={{ opacity: 0.3 }}
        />
    );
};

export default ParticlesBackground;
