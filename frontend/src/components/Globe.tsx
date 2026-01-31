import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { FontLoader } from 'three/examples/jsm/loaders/FontLoader'
import { TextGeometry } from 'three/examples/jsm/geometries/TextGeometry'

type GlobeProps = {
  onCityClick?: () => void
}

export default function Globe({ onCityClick }: GlobeProps) {
  const mountRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!mountRef.current) return

    const width = window.innerWidth
    const height = window.innerHeight

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000)
    camera.position.z = 3
    camera.lookAt(0, 0, 0)

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setSize(width, height)
    renderer.domElement.style.width = '100vw'
    renderer.domElement.style.height = '100vh'
    renderer.domElement.style.position = 'absolute'
    renderer.setClearColor(0x081029, 1)
    renderer.setPixelRatio(window.devicePixelRatio || 1)
    mountRef.current.appendChild(renderer.domElement)

    const light = new THREE.AmbientLight(0xffffff, 1)
    scene.add(light)

    const radius = 1
    const sphereGeo = new THREE.SphereGeometry(radius, 64, 64)
    // make the globe blue and visible
    const sphereMat = new THREE.MeshStandardMaterial({ color: 0x2a6cff, roughness: 0.6, metalness: 0.1 })
    const globe = new THREE.Mesh(sphereGeo, sphereMat)
    scene.add(globe)

    // Create 3D text meshes arranged around the equator to form "LiveCut" ring
    const fontLoader = new FontLoader()
    const textGroup = new THREE.Group()
    fontLoader.load('https://threejs.org/examples/fonts/helvetiker_regular.typeface.json', (font) => {
      const text = 'LiveCut'
      const textSize = 0.18
      const textHeight = 0.04
      const segments = 8 // number of repeats around globe
      for (let i = 0; i < segments; i++) {
        const textGeo = new TextGeometry(text, {
          font,
          size: textSize,
          height: textHeight,
          curveSegments: 8,
          bevelEnabled: false,
        })
        textGeo.computeBoundingBox()
        const bb = textGeo.boundingBox!
        const textWidth = (bb.max.x - bb.min.x)
        // center geometry
        textGeo.translate(-textWidth / 2, 0, 0)

        const textMat = new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.3 })
        const mesh = new THREE.Mesh(textGeo, textMat)
        const angle = (i / segments) * Math.PI * 2
        const r = radius * 1.12
        mesh.position.set(Math.cos(angle) * r, 0, Math.sin(angle) * r)
        // orient so the text faces outward
        mesh.lookAt(new THREE.Vector3(mesh.position.x * 2, 0, mesh.position.z * 2))
        // tilt slightly for nicer look
        mesh.rotateX(Math.PI * 0.02)
        textGroup.add(mesh)
      }
      globe.add(textGroup)
    })

    // pointer interaction: click marker or drag to rotate globe
    let isPointerDown = false
    let startX = 0
    let startY = 0
    function onPointerDown(event: PointerEvent) {
      if (!renderer.domElement) return
      isPointerDown = true
      startX = event.clientX
      startY = event.clientY
      renderer.domElement.setPointerCapture?.((event as any).pointerId)
    }

    function onPointerMove(event: PointerEvent) {
      if (!isPointerDown) return
      const dx = event.clientX - startX
      const dy = event.clientY - startY
      startX = event.clientX
      startY = event.clientY
      // rotate globe according to movement
      globe.rotation.y += dx * 0.005
      globe.rotation.x += dy * 0.005
      // clamp x rotation
      globe.rotation.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, globe.rotation.x))
    }

    function onPointerUp(event: PointerEvent) {
      isPointerDown = false
      renderer.domElement.releasePointerCapture?.((event as any).pointerId)
    }

    renderer.domElement.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)

    // animation
    let req = 0
    function animate() {
      // gentle auto-rotation around Y only; X rotation is controlled by user drag
      globe.rotation.y += 0.0015
      renderer.render(scene, camera)
      req = requestAnimationFrame(animate)
    }
    animate()

    // handle resize
    function onResize() {
      const w = window.innerWidth
      const h = window.innerHeight
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      renderer.setSize(w, h)
      renderer.domElement.style.width = '100vw'
      renderer.domElement.style.height = '100vh'
    }
    window.addEventListener('resize', onResize)

    // cleanup
    return () => {
      cancelAnimationFrame(req)
      renderer.domElement.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
      window.removeEventListener('resize', onResize)
      mountRef.current?.removeChild(renderer.domElement)
      scene.clear()
    }
  }, [onCityClick])

  return (
    <div style={{ position: 'fixed', inset: 0, width: '100vw', height: '100vh', zIndex: 0 }}>
      <div ref={mountRef} style={{ width: '100%', height: '100%', position: 'relative' }} />
    </div>
  )
}
