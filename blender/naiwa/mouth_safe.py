"""Local, watertight expression mouth preserving the SDF sculpt elsewhere.

install_mouth(body) -> {objects, boundary_count, removed_faces, region}
Only the small front-face patch is replaced; its original perimeter is reused.
The base patch follows the original mesh exactly, sampled by BVH rays. The
Laugh_Open key opens a real lip/cavity loop with individual teeth and tongue.
"""
from __future__ import annotations
import math
from collections import Counter, defaultdict
import numpy as np
import bpy
import bmesh
from mathutils import Vector
from mathutils.bvhtree import BVHTree
import shape
from build import srgb


def _mat(name, color, rough=.7, spec=.08):
    m=bpy.data.materials.new(name);m.use_nodes=True
    p=m.node_tree.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value=srgb(color)
    p.inputs['Roughness'].default_value=rough
    p.inputs['Specular IOR Level'].default_value=spec
    return m


def _keyed(name, rest, opened, faces, material):
    me=bpy.data.meshes.new(name);me.from_pydata(rest,[],faces);me.update()
    ob=bpy.data.objects.new(name,me);bpy.context.scene.collection.objects.link(ob)
    me.materials.append(material)
    for f in me.polygons:f.use_smooth=True
    ob.shape_key_add(name='Basis');key=ob.shape_key_add(name='Laugh_Open')
    key.data.foreach_set('co',np.asarray(opened,np.float32).ravel())
    return ob


def _clean_expression_mesh(body, distance=2e-7):
    """Weld float32-equivalent cuts while retaining shape keys and colors.

    Blender stores coordinates as float32. Exact rectangle intersections made
    in float64 can become duplicate vertices after mesh creation, leaving
    zero-area lip quads that produce bright diagonal rendering streaks.
    Edit-mode BMesh carries both key layers and point attributes through the
    weld; doing this before skinning also avoids merging unrelated weights.
    """
    previous_active=bpy.context.view_layer.objects.active
    previous_selected=list(bpy.context.selected_objects)
    before=len(body.data.vertices)
    bpy.ops.object.select_all(action='DESELECT')
    body.select_set(True);bpy.context.view_layer.objects.active=body
    body.active_shape_key_index=0
    try:
        bpy.ops.object.mode_set(mode='EDIT')
        bm=bmesh.from_edit_mesh(body.data)
        bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=distance)
        bmesh.ops.dissolve_degenerate(bm,edges=list(bm.edges),dist=distance)
        bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
        bmesh.update_edit_mesh(body.data,loop_triangles=True,destructive=True)
    finally:
        if body.mode!='OBJECT':bpy.ops.object.mode_set(mode='OBJECT')
        body.select_set(False)
        for ob in previous_selected:ob.select_set(True)
        bpy.context.view_layer.objects.active=previous_active
    return before-len(body.data.vertices)


def _cut_face_rectangle(P, faces, material_ids, rect):
    """Clip local front triangles into a true rectangle, welding shared cuts.

    Grid-split each intersecting original face. Splits on original shared edges
    are propagated to neighboring retained faces, preventing T junctions.
    Every cut point is an exact barycentric point of the original surface.
    """
    xmin,xmax,zmin,zmax=rect
    points=[np.array(p,float) for p in P]
    bary=[{i:1.0} for i in range(len(P))]
    lookup={tuple(np.round(p,9)):i for i,p in enumerate(points)}
    edge_points=defaultdict(set)
    def new_point(a,b,t,axis,value):
        p=points[a]*(1-t)+points[b]*t;p[axis]=value
        key=tuple(np.round(p,9))
        if key in lookup:return lookup[key]
        weights=defaultdict(float)
        for j,w in bary[a].items():weights[j]+=w*(1-t)
        for j,w in bary[b].items():weights[j]+=w*t
        weights={j:w for j,w in weights.items() if abs(w)>1e-9}
        idx=len(points);points.append(p);bary.append(weights);lookup[key]=idx
        if len(weights)==2:edge_points[tuple(sorted(weights))].add(idx)
        return idx
    def clip(poly,axis,value,greater):
        out=[]
        for a,b in zip(poly[-1:]+poly[:-1],poly):
            da=(points[a][axis]-value)*(1 if greater else -1)
            db=(points[b][axis]-value)*(1 if greater else -1)
            ia,ib=da>=-1e-11,db>=-1e-11
            if ia!=ib:out.append(new_point(a,b,da/(da-db),axis,value))
            if ib:out.append(b)
        clean=[]
        for v in out:
            if not clean or v!=clean[-1]:clean.append(v)
        if len(clean)>1 and clean[0]==clean[-1]:clean.pop()
        if len(clean)<3:return []
        v=np.asarray([points[j] for j in clean]);normal=np.cross(v[1:-1]-v[0],v[2:]-v[0]).sum(axis=0)
        return clean if np.linalg.norm(normal)>1e-13 else []
    kept=[];mats=[];removed=0
    for f,mi in zip(faces,material_ids):
        q=P[list(f)]
        candidate=(q[:,0].max()>xmin and q[:,0].min()<xmax and q[:,2].max()>zmin and q[:,2].min()<zmax)
        if candidate:
            c=q.mean(axis=0);_,cy,ry=shape.profile(c[2]);candidate=c[1]<cy-.05*ry
        if not candidate:kept.append(list(f));mats.append(mi);continue
        pieces=[list(f)]
        for axis,value in [(0,xmin),(0,xmax),(2,zmin),(2,zmax)]:
            split=[]
            for poly in pieces:
                coord=[points[v][axis] for v in poly]
                if min(coord)<value-1e-11 and max(coord)>value+1e-11:
                    for greater in (False,True):
                        part=clip(poly,axis,value,greater)
                        if part:split.append(part)
                else:split.append(poly)
            pieces=split
        for poly in pieces:
            c=np.asarray([points[v] for v in poly]).mean(axis=0)
            if xmin+1e-10<c[0]<xmax-1e-10 and zmin+1e-10<c[2]<zmax-1e-10:removed+=1
            else:kept.append(poly);mats.append(mi)
    stitched=[]
    for f in kept:
        out=[]
        for a,b in zip(f,f[1:]+f[:1]):
            out.append(a);support=set(bary[a])|set(bary[b])
            if len(support)!=2:continue
            edge=tuple(sorted(support));candidates=edge_points.get(edge,())
            va=points[a];direction=points[b]-va;length2=float(direction@direction)
            if length2<1e-18:continue
            additions=[]
            for v in candidates:
                if v in (a,b):continue
                t=float((points[v]-va)@direction/length2)
                if 1e-8<t<1-1e-8:additions.append((t,v))
            out.extend(v for _,v in sorted(additions))
        stitched.append(tuple(out))
    edges=Counter()
    for f in stitched:
        for a,b in zip(f,f[1:]+f[:1]):edges[tuple(sorted((a,b)))]+=1
    adj=defaultdict(list)
    for (a,b),n in edges.items():
        if n==1:adj[a].append(b);adj[b].append(a)
        elif n!=2:raise RuntimeError('Nonmanifold edge introduced in local mouth cut')
    if not adj or any(len(v)!=2 for v in adj.values()):raise RuntimeError('Mouth rectangle has unresolved split edges')
    first=min(adj);boundary=[first];prev=None;cur=first
    while True:
        nxt=next(v for v in adj[cur] if v!=prev)
        if nxt==first:break
        if nxt in boundary:raise RuntimeError('Mouth cut boundary self-touches')
        boundary.append(nxt);prev,cur=cur,nxt
    if len(boundary)!=len(adj):raise RuntimeError('Mouth rectangle has multiple open loops')
    Q=np.asarray(points)
    area=sum(Q[a,0]*Q[b,2]-Q[b,0]*Q[a,2] for a,b in zip(boundary,boundary[1:]+boundary[:1]))
    if area<0:boundary.reverse()
    return Q,stitched,mats,boundary,bary,removed


def install_mouth(body):
    if body.data.shape_keys:raise ValueError('Install mouth before adding shape keys')
    if tuple(body.scale)!=(1.0,1.0,1.0) or body.location.length>1e-8:
        raise ValueError('Body must use world coordinates and identity transforms')
    old=body.data
    P=np.empty((len(old.vertices),3),np.float64);old.vertices.foreach_get('co',P.ravel())
    faces=[tuple(p.vertices) for p in old.polygons]
    z0=float(shape.MOUTH_Z);half=float(shape.MOUTH_HALF)
    bvh=BVHTree.FromPolygons([Vector(p) for p in P],faces)
    P,kept,kept_mats,boundary,bary,removed_count=_cut_face_rectangle(
        P,faces,[p.material_index for p in old.polygons],(-.102,.102,z0-.137,z0+.020))
    def surf(x,z):
        hit,_,_,_=bvh.ray_cast(Vector((float(x),-.7,float(z))),Vector((0,1,0)))
        if hit is None:raise RuntimeError(f'Face sampling missed x={x}, z={z}')
        return float(hit.y)
    B=P[boundary];N=len(boundary)
    zc=(B[:,2].min()+B[:,2].max())*.5
    rx=max(abs(B[:,0]).max(),.001);rz=(B[:,2].max()-B[:,2].min())*.5
    angles=np.arctan2((B[:,2]-zc)/rz,B[:,0]/rx)
    used=sorted(set(i for f in kept for i in f))
    remap={v:i for i,v in enumerate(used)}
    rest=[tuple(P[i]) for i in used];opened=list(rest)
    newfaces=[tuple(remap[v] for v in f) for f in kept]
    newmats=list(kept_mats)
    previous=[remap[i] for i in boundary]
    source_count=len(rest)
    inner_index=len(old.materials)
    # Match each outer rectangular ray to the same polar ray on the D-shaped
    # opening. Using ellipse phase directly puts its high mouth corner opposite
    # the middle of the rectangle, folding tiny quads near the lip at full laugh.
    phase=np.linspace(-math.pi,math.pi,8193)
    sx,sz=np.cos(phase),np.sin(phase)
    lx=.087*sx
    lz=z0-.002+np.where(sz>=0,.011*np.maximum(sz,0)**.55,-.113*np.maximum(-sz,0)**.87)
    polar=np.unwrap(np.arctan2((lz-zc)/rz,lx/rx))
    def lip(a,laugh):
        if laugh:
            angle=polar[0]+((a-polar[0])%(2*math.pi))
            a=float(np.interp(angle,polar,phase))
        c,s=math.cos(a),math.sin(a)
        if laugh:
            return .087*c,z0-.002+(.011*max(s,0)**.55 if s>=0 else -.113*(-s)**.87)
        return half*c,z0+.0048*s*s+.00045*s
    def connect(current,material):
        nonlocal previous
        for i in range(N):
            j=(i+1)%N
            newfaces.append((previous[i],previous[j],current[j],current[i]));newmats.append(material)
        previous=current
    for ring in range(1,15):
        t=ring/14;current=list(range(len(rest),len(rest)+N))
        for laugh,V in ((False,rest),(True,opened)):
            for b,a in zip(B,angles):
                lx,lz=lip(a,laugh);x=b[0]*(1-t)+lx*t;z=b[2]*(1-t)+lz*t
                y=surf(x,z)-(.0011 if laugh else 0.0)*t**7
                V.append((x,y,z))
        connect(current,0)
    for radial,depth in [(0.994,.0017),(.95,.007),(.80,.025),(.54,.048),(.22,.063)]:
        current=list(range(len(rest),len(rest)+N))
        for laugh,V in ((False,rest),(True,opened)):
            cz=z0-.053 if laugh else z0+.0039
            for a in angles:
                lx,lz=lip(a,laugh);x=lx*radial;z=cz+(lz-cz)*radial
                V.append((x,surf(x,z)+(depth if laugh else depth*.5),z))
        connect(current,inner_index)
    cap=len(rest)
    rest.append((0,surf(0,z0+.0039)+.035,z0+.0039))
    opened.append((0,surf(0,z0-.053)+.066,z0-.053))
    for i in range(N):newfaces.append((previous[i],previous[(i+1)%N],cap));newmats.append(inner_index)
    me=bpy.data.meshes.new(old.name+' • expression topology')
    me.from_pydata(rest,[],newfaces);me.update()
    for m in old.materials:me.materials.append(m)
    me.materials.append(_mat('Mouth cavity','#170509',.9,.02))
    for p,mi in zip(me.polygons,newmats):p.use_smooth=True;p.material_index=mi
    # Preserve the existing shader's mask/crease data; added face skin is yellow.
    for attr in old.color_attributes:
        if attr.domain!='POINT':continue
        src=np.empty((len(old.vertices),4),np.float32);attr.data.foreach_get('color',src.ravel())
        dst=np.zeros((len(rest),4),np.float32);dst[:,3]=1
        for j,old_i in enumerate(used):
            dst[j]=sum(src[i]*w for i,w in bary[old_i].items())
        out=me.color_attributes.new(attr.name,attr.data_type,'POINT');out.data.foreach_set('color',dst.ravel())
    body.data=me
    body.shape_key_add(name='Basis');key=body.shape_key_add(name='Laugh_Open')
    key.data.foreach_set('co',np.asarray(opened,np.float32).ravel())
    merged_vertices=_clean_expression_mesh(body)
    # Teeth and tongue remain separate actual geometry, recessed behind the lips.
    teeth=_teeth(surf,z0)
    tongue=_tongue(surf,z0)
    # Exact side/back vertex coordinates are copied; only the local face cut differs.
    return {'objects':[teeth,tongue],'boundary_count':N,'removed_faces':removed_count,
            'preserved_vertices':source_count,'region':[-.102,.102,z0-.137,z0+.020],
            'surface':surf,'original_bvh':bvh,'merged_vertices':merged_vertices,
            'cleanup_distance':2e-7}


def _teeth(surf,z0):
    rest=[];opened=[];faces=[]
    specs=[]
    for x in np.linspace(-.069,.069,10):
        side=abs(x)/.075;w=.0145;h=.0165-.0045*side**1.7
        z=z0+.002-.005*side**1.7-h*.4
        specs.append((x,surf(x,z)+.005,z,w,.014,h))
    for x in np.linspace(-.047,.047,8):
        side=abs(x)/.087;bottom=z0-.002-.113*(max(0,1-side*side)**.5)**.87
        z=bottom+.010
        specs.append((x,surf(x,z)+.007,z,.0128,.013,.0125))
    for x,y,z,w,d,h in specs:
        bpy.ops.mesh.primitive_cube_add(size=1)
        ob=bpy.context.object;ob.dimensions=(w,d,h)
        bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
        mod=ob.modifiers.new('Rounded enamel','BEVEL');mod.width=.0025;mod.segments=3
        bpy.ops.object.modifier_apply(modifier=mod.name)
        offset=len(rest);yaw=-x*2;ca,sa=math.cos(yaw),math.sin(yaw)
        for p in ob.data.vertices:
            vx,vy,vz=p.co;opened.append((x+vx*ca-vy*sa,y+vx*sa+vy*ca,z+vz))
            rest.append((x*.2+vx*.1,surf(0,z0)+.020+vy*.1,z0+vz*.01))
        faces.extend(tuple(i+offset for i in f.vertices) for f in ob.data.polygons)
        bpy.data.objects.remove(ob,do_unlink=True)
    return _keyed('Teeth',rest,opened,faces,_mat('Ivory teeth','#EFE9D9',.55,.08))


def _tongue(surf,z0):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=32,ring_count=16,radius=1)
    ob=bpy.context.object;unit=[tuple(v.co) for v in ob.data.vertices];faces=[tuple(p.vertices) for p in ob.data.polygons]
    bpy.data.objects.remove(ob,do_unlink=True)
    rest=[(x*.004,surf(0,z0)+.028+y*.002,z0+z*.001) for x,y,z in unit]
    opened=[(x*.039,surf(0,z0-.09)+.031+y*.018,z0-.089+z*.014) for x,y,z in unit]
    return _keyed('Tongue',rest,opened,faces,_mat('Muted tongue','#82373E',.8,.04))
