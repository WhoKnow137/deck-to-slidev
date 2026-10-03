---
title: OE0A public synthetic layers
layout: figma
figmaSlideId: public-synthetic
figmaBackground: '#111827'
figmaNavTarget: null
canvasWidth: 1920
aspectRatio: 16/9
---

<StudioLayer version="1" id="oe-image" slide-id="public-synthetic" source-id="synthetic:image" source-type="RECTANGLE" kind="image" pos="160,180,360,220" rotate="0" rotation="true" capability="FULL" reason="Layer frame; immutable image paint"><DeckImage style="position:absolute;left:0;top:0;width:100%;height:100%" src="/media/synthetic.png" kind="image" :media-style='{ "position":"absolute","width":"125%","height":"100%","left":"-12.5%","top":"0","objectFit":"fill" }' /></StudioLayer>

<StudioLayer version="1" id="oe-video" slide-id="public-synthetic" source-id="synthetic:video" source-type="RECTANGLE" kind="video" pos="650,180,360,220" rotate="0" rotation="true" capability="FULL" reason="Layer frame; immutable playback/paint"><DeckVideo style="position:absolute;left:0;top:0;width:100%;height:100%;border-radius:8px;overflow:hidden" src="/media/synthetic.mp4" :media-style='{ "position":"absolute","width":"100%","height":"100%","objectFit":"cover" }' :playback='{ "autoplay":false,"muted":true,"mediaLoop":true,"showControls":false,"playbackRate":1 }' /></StudioLayer>

<StudioLayer version="1" id="oe-shape" slide-id="public-synthetic" source-id="synthetic:shape" source-type="SHAPE_WITH_TEXT" kind="shape" pos="1120,180,360,220" rotate="0" rotation="true" capability="POSITION_ONLY" reason="Resize disabled to preserve generated path and paint"><div style="width:100%;height:100%"><svg viewBox="0 0 360 220" style="width:100%;height:100%"><defs><linearGradient id="synthetic-gradient" x1="0" x2="1" y1="0" y2="0"><stop offset="0" stop-color="#0284c7" /><stop offset="1" stop-color="#7c3aed" /></linearGradient></defs><path d="M0 0L360 0L360 220L0 220Z" fill="url(#synthetic-gradient)" /></svg></div></StudioLayer>

<StudioLayer version="1" id="oe-vector" slide-id="public-synthetic" source-id="synthetic:vector" source-type="VECTOR" kind="vector" pos="160,560,260,220" rotate="0" rotation="true" capability="POSITION_ONLY" reason="W/H read-only; preserve vector topology"><svg viewBox="0 0 260 220" style="width:100%;height:100%"><path d="M130 0L260 220L0 220Z" fill="#f59e0b" /></svg></StudioLayer>

<StudioLayer version="1" id="oe-frame" slide-id="public-synthetic" source-id="synthetic:frame" source-type="FRAME" kind="frame" pos="650,560,360,220" rotate="0" rotation="true" capability="POSITION_ONLY" reason="Frame resize disabled until child constraints are supported"><DeckGroup style="position:relative;width:100%;height:100%" fill="#334155"><div data-synthetic-child="frame-child" style="position:absolute;left:40px;top:50px;width:160px;height:80px;background:#2dd4bf"></div></DeckGroup></StudioLayer>

<StudioLayer version="1" id="oe-instance" slide-id="public-synthetic" source-id="synthetic:instance" source-type="MOCK_INSTANCE_ROOT" kind="instance" pos="1120,560,360,220" rotate="0" rotation="true" capability="POSITION_ONLY" reason="Public mocked imported root; child overrides and resize unavailable"><DeckGroup style="position:relative;width:100%;height:100%" fill="#4c1d95"><div style="position:absolute;left:50px;top:70px;width:180px;height:60px;background:#c4b5fd"></div></DeckGroup></StudioLayer>

<StudioText version="1" id="oe-text" pos="160,850,1300,100" resize="fixed" rotate="0" font-size="48" font-family="Inter" color="#ffffff">OE0A synthetic editable text</StudioText>

<div data-studio-render-only="Ambiguous synthetic source identity; mutation unavailable" style="position:absolute;left:160px;top:40px;width:460px;height:70px;background:#7f1d1d;color:white;padding:12px">Synthetic render-only refusal</div>

<!-- Public synthetic presenter notes. -->
