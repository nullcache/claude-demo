"""Safe optional animation layer for the measured SDF Naiwa model.

Public API:
    rig, actions = add_animation(body, eyes, {'L':arm_L, 'R':arm_R}, mouth_line)

Body must exclude both arms. Each arm must be a separate closed mesh including
its hand, in the exact static coordinates defined by shape.py. This separation
is required: no arm weights are ever assigned to the belly or body sides.
Default scene is the unchanged neutral rest at Idle frame 1. No old rig.py or
legacy actions.py face geometry is used. Laugh_Belly is a 120-frame clip at24fps.
"""
from __future__ import annotations
import math
import numpy as np
import bpy
from mathutils import Vector,Matrix,Quaternion
import shape
from build import srgb
from mouth_safe import install_mouth,_keyed


def smooth(a,b,x):
    t=np.clip((x-a)/(b-a),0,1);return t*t*(3-2*t)


def chain_parameter(P,points):
    best=np.full(len(P),1e10);par=np.zeros(len(P))
    for i,(a,b) in enumerate(zip(points[:-1],points[1:])):
        a,b=np.asarray(a),np.asarray(b);ab=b-a
        t=np.clip(((P-a)@ab)/(ab@ab),0,1)
        d=np.linalg.norm(P-a-t[:,None]*ab,axis=1);select=d<best
        best[select]=d[select];par[select]=i+t[select]
    return par


def make_rig():
    spec={'root':((0,0,0),(0,0,.12),None),
          'hips':((0,.01,.20),(0,.01,.40),'root'),
          'spine':((0,.01,.40),(0,.01,.60),'hips'),
          'chest':((0,.01,.60),(0,0,.755),'spine'),
          'head':((0,0,.755),(0,-.10,.99),'chest'),
          'tail.01':((0,.14,.225),(0,.27,.24),'hips'),
          'tail.02':((0,.27,.24),(0,.375,.255),'tail.01')}
    for s,tag in ((1,'L'),(-1,'R')):
        m=lambda v:tuple(shape.mirror(np.asarray(v,float),s))
        ma=lambda v:tuple(shape.arm_to_apose(shape.mirror(np.asarray(v,float),s),s))
        S,E,W=(ma(v) for v in (shape.SHOULDER,shape.ELBOW,shape.WRIST))
        tip=np.mean([f[2] for f in shape.FINGERS],axis=0)
        K=(shape.HIP+shape.ANKLE)*.5
        spec.update({f'upperarm.{tag}':(S,E,'chest'),f'forearm.{tag}':(E,W,f'upperarm.{tag}'),
                     f'hand.{tag}':(W,ma(tip),f'forearm.{tag}'),
                     f'thigh.{tag}':(m(shape.HIP),m(K),'hips'),
                     f'shin.{tag}':(m(K),m(shape.ANKLE),f'thigh.{tag}'),
                     f'foot.{tag}':(m(shape.ANKLE),m(shape.FOOT_C+np.array([0,-.07,0])),f'shin.{tag}')})
    bpy.ops.object.select_all(action='DESELECT')
    arm=bpy.data.armatures.new('Naiwa_SafeRig');rig=bpy.data.objects.new('Naiwa_SafeRig',arm)
    bpy.context.scene.collection.objects.link(rig);rig.select_set(True);bpy.context.view_layer.objects.active=rig
    bpy.ops.object.mode_set(mode='EDIT')
    for name,(head,tail,parent) in spec.items():
        b=arm.edit_bones.new(name);b.head=head;b.tail=tail;b.use_deform=name!='root'
        if parent:b.parent=arm.edit_bones[parent]
    bpy.ops.object.mode_set(mode='OBJECT')
    for p in rig.pose.bones:p.rotation_mode='QUATERNION'
    rig['laugh']=0.0;rig.id_properties_ui('laugh').update(min=0,max=1)
    rig['notes']='Idle / Laugh_Belly; independent arm meshes prevent belly stretching. Front -Y.'
    rig.show_in_front=False;rig.animation_data_create()
    return rig,spec


def bind_weights(obj,rig,weights):
    if isinstance(weights,str):weights={weights:np.ones(len(obj.data.vertices))}
    total=sum(weights.values());total=np.maximum(total,1e-9)
    for name,w in weights.items():
        vg=obj.vertex_groups.get(name) or obj.vertex_groups.new(name=name)
        values=w/total
        for i in np.flatnonzero(values>.0001):vg.add([int(i)],float(values[i]),'REPLACE')
    m=obj.modifiers.new('Character deformation','ARMATURE');m.object=rig;m.use_deform_preserve_volume=True
    old=obj.matrix_world.copy();obj.parent=rig;obj.matrix_world=old


def bind_body(body,rig):
    P=np.asarray([tuple(v.co) for v in body.data.vertices]);d=shape.parts(P);z=P[:,2]
    categories=['body','tail','leg.L','leg.R']
    distances=[d['body'],d['tail']]
    distances += [np.minimum.reduce([d[f'leg.{t}'],d[f'foot.{t}'],d[f'toes.{t}']]) for t in ('L','R')]
    D=np.stack(distances,axis=1);E=np.exp(-(D-D.min(axis=1,keepdims=True))/.006);E/=E.sum(axis=1,keepdims=True)
    G={k:E[:,i] for i,k in enumerate(categories)}
    head=smooth(.72,.785,z);chest=smooth(.51,.68,z)*(1-head);hips=1-smooth(.30,.48,z)
    spine=np.clip(1-head-chest-hips,0,1)
    W={n:G['body']*w for n,w in [('hips',hips),('spine',spine),('chest',chest),('head',head)]}
    blend=smooth(.24,.32,P[:,1]);W['tail.01']=G['tail']*(1-blend);W['tail.02']=G['tail']*blend
    for s,tag in ((1,'L'),(-1,'R')):
        foot=1-smooth(.065,.10,z);shin=(1-smooth(.13,.17,z))*(1-foot)
        upper=np.clip(1-foot-shin,0,1);W[f'thigh.{tag}']=G[f'leg.{tag}']*upper
        W[f'shin.{tag}']=G[f'leg.{tag}']*shin;W[f'foot.{tag}']=G[f'leg.{tag}']*foot
    bind_weights(body,rig,W)


def bind_arm(ob,rig,tag,spec):
    P=np.asarray([tuple(v.co) for v in ob.data.vertices])
    names=[f'upperarm.{tag}',f'forearm.{tag}',f'hand.{tag}']
    points=[spec[n][0] for n in names]+[spec[names[-1]][1]]
    p=chain_parameter(P,points)
    fore=smooth(.75,1.25,p);hand=smooth(1.86,2.14,p)
    bind_weights(ob,rig,{names[0]:1-fore,names[1]:fore*(1-hand),names[2]:hand})


def drive(key,rig,expression='laugh'):
    d=key.driver_add('value').driver;d.type='SCRIPTED';v=d.variables.new();v.name='laugh'
    v.targets[0].id=rig;v.targets[0].data_path='["laugh"]';d.expression=expression


def parent_bone(ob,rig,bone):
    # Mesh skinning avoids bone-parent tail offsets and keeps world transforms.
    if ob.type=='MESH':bind_weights(ob,rig,bone)
    else:
        mw=ob.matrix_world.copy();ob.parent=rig;ob.parent_type='BONE';ob.parent_bone=bone
        bpy.context.view_layer.update();ob.matrix_world=mw


def smile_eyes(eyes,rig,surface):
    lidmat=bpy.data.materials.new('Laugh eyelid');lidmat.use_nodes=True
    bs=lidmat.node_tree.nodes['Principled BSDF'];bs.inputs['Base Color'].default_value=srgb('#302313')
    bs.inputs['Roughness'].default_value=.85;bs.inputs['Specular IOR Level'].default_value=.02
    all_lids=[]
    for eye in eyes:
        side=1 if eye.name.endswith('L') else -1
        inv=eye.matrix_world.inverted();eye.shape_key_add(name='Basis');key=eye.shape_key_add(name='Laugh_Open')
        center=eye.matrix_world.translation.copy()
        for p,v in zip(key.data,eye.data.vertices):
            world=eye.matrix_world@v.co
            # Collapse the disc under its own face surface; its neutral vertices
            # and shader stay unchanged.
            x=center.x+(world.x-center.x)*.12;z=center.z+(world.z-center.z)*.12
            p.co=inv@Vector((x,surface(x,z)+.012,z))
        drive(key,rig,'min(1,max(0,laugh*1.55))')
        parent_bone(eye,rig,'head')
        rest=[];opened=[];faces=[];cx=shape.EYE_X*side;cz=shape.EYE_Z-.002
        for i,u in enumerate(np.linspace(-1,1,41)):
            x=cx+u*shape.EYE_DISC*.94
            z=cz+.010*(1-u*u)+side*u*.008
            width=.0005+.0018*max(0,1-u*u)**.7
            for sign in (-1,1):
                zz=z+sign*width
                max_x=float(shape.profile(zz)[0])*.965
                xx=max(-max_x,min(max_x,x))
                opened.append((xx,surface(xx,zz)-.0013,zz))
                rest.append((xx,surface(xx,zz)+.007,zz))
            if i:faces.append((2*i-2,2*i,2*i+1,2*i-1))
        lid=_keyed('Smile eyelid.'+('L' if side>0 else 'R'),rest,opened,faces,lidmat)
        # Bring the eyelid above the skin before the shrinking iris disappears.
        # Its rest position is recessed by 7 mm, so a slow linear fade leaves
        # the face briefly blank between the neutral and laughing expressions.
        drive(lid.data.shape_keys.key_blocks['Laugh_Open'],rig,'min(1,max(0,laugh*13))')
        parent_bone(lid,rig,'head');all_lids.append(lid)
    return all_lids


def _reset(rig):
    for b in rig.pose.bones:b.location=(0,0,0);b.rotation_quaternion=(1,0,0,0);b.scale=(1,1,1)
    rig['laugh']=0.0
    bpy.context.view_layer.update()


def _rotate(rig,name,axis,degrees):
    b=rig.pose.bones[name];M=b.bone.matrix_local.to_3x3()
    b.rotation_quaternion=(M.inverted()@Quaternion(Vector(axis),math.radians(degrees)).to_matrix()@M).to_quaternion()


def _orient(rig,name,head,tail):
    b=rig.pose.bones[name];R=b.bone.matrix_local.to_3x3()
    q=R.col[1].normalized().rotation_difference((tail-head).normalized())
    m=(q.to_matrix()@R).to_4x4();m.translation=head;b.matrix=m
    bpy.context.view_layer.update()


def _belly_arm(rig,tag,strength):
    s=1 if tag=='L' else -1
    names=[f'upperarm.{tag}',f'forearm.{tag}',f'hand.{tag}']
    upper,fore,hand=[rig.pose.bones[n] for n in names]
    torso=rig.pose.bones['spine'];deform=torso.matrix@torso.bone.matrix_local.inverted()
    shoulder=upper.head.copy();initial=hand.head.copy()
    # Hands sit on the front of the measured abdomen at z~.43. The fingertips
    # point inward/down toward the center, with the palm surface touching belly.
    target=deform@Vector((s*.150,-.205,.480))
    target_tip=deform@Vector((s*.095,-.266,.415))
    wrist=initial.lerp(target,strength);direction=wrist-shoulder
    a,b=upper.bone.length,fore.bone.length;distance=min(max(direction.length,abs(a-b)+.0001),a+b-.0001)
    direction.normalize();wrist=shoulder+direction*distance
    along=(a*a-b*b+distance*distance)/(2*distance);height=math.sqrt(max(0,a*a-along*along))
    hint=(deform@Vector((s*.39,-.10,.48)))-shoulder
    pole=hint-direction*hint.dot(direction)
    if pole.length<1e-6:pole=Vector((s,0,0))
    pole.normalize();elbow=shoulder+direction*along+pole*height
    _orient(rig,names[0],shoulder,elbow);_orient(rig,names[1],elbow,wrist)
    _orient(rig,names[2],wrist,hand.tail.lerp(target_tip,strength))


def _key(rig,frame):
    for b in rig.pose.bones:
        for path in ('location','rotation_quaternion','scale'):b.keyframe_insert(path,frame=frame,group=b.name)
    rig.keyframe_insert('["laugh"]',frame=frame,group='Expression')


def make_actions(rig,character):
    # Dense meshes are irrelevant to analytic bone placement during key baking.
    visibility={ob:ob.hide_viewport for ob in character}
    for ob in visibility:ob.hide_viewport=True
    actions={}
    try:
        for name in ('Idle','Laugh_Belly'):
            act=bpy.data.actions.new(name);act.use_fake_user=True;rig.animation_data.action=act;actions[name]=act
            if name=='Idle':
                for frame,phase in [(1,0),(25,1),(49,0),(73,-1),(97,0)]:
                    _reset(rig)
                    rig.pose.bones['spine'].scale=(1+.005*phase,1+.004*phase,1+.004*phase)
                    _rotate(rig,'head',(0,0,1),.45*phase);_key(rig,frame)
            else:
                for frame,amount,bend,shake in [(1,0,0,0),(10,0,0,0),(20,.8,.1,0),(28,1,.2,1),(36,1,.4,-1),(44,1,.7,1),(52,1,1,-1),(60,1,1,1),(68,1,.8,-1),(76,1,.6,1),(84,1,.35,-1),(96,1,.15,1),(108,.6,0,0),(120,0,0,0)]:
                    _reset(rig)
                    _rotate(rig,'spine',(1,0,0),(3+7*bend+2*shake)*amount)
                    _rotate(rig,'chest',(1,0,0),(2+6*bend+2*shake)*amount)
                    _rotate(rig,'head',(1,0,0),(-12+13*bend+2*shake)*amount)
                    root=rig.pose.bones['root']
                    root.location=root.bone.matrix_local.to_3x3().inverted()@Vector((0,0,.0015*shake*amount))
                    bpy.context.view_layer.update()
                    if amount:
                        for tag in ('L','R'):_belly_arm(rig,tag,amount)
                    rig['laugh']=amount*(1-.035*max(0,-shake));_key(rig,frame)
            for fc in act.fcurves:
                for k in fc.keyframe_points:k.interpolation='BEZIER';k.handle_left_type='AUTO_CLAMPED';k.handle_right_type='AUTO_CLAMPED'
    finally:
        for ob,visible in visibility.items():ob.hide_viewport=visible
    rig.animation_data.action=actions['Idle'];bpy.context.scene.frame_set(1);_reset(rig)
    bpy.context.scene.render.fps=24;bpy.context.scene.frame_start=1;bpy.context.scene.frame_end=120
    return actions


def add_animation(body,eyes,arms,mouth_line=None):
    if set(arms)!=set(('L','R')):raise ValueError('Provide two independent arm meshes, keys L and R')
    if any(ob is body for ob in arms.values()):raise ValueError('Arms must not be fused to body')
    print('SAFE_RIG mouth topology',flush=True)
    mouth=install_mouth(body)
    rig,spec=make_rig()
    print('SAFE_RIG body skinning',flush=True);bind_body(body,rig)
    for tag,ob in arms.items():bind_arm(ob,rig,tag,spec)
    drive(body.data.shape_keys.key_blocks['Laugh_Open'],rig)
    for ob in mouth['objects']:
        bind_weights(ob,rig,'head');drive(ob.data.shape_keys.key_blocks['Laugh_Open'],rig)
    lids=smile_eyes(eyes,rig,mouth['surface'])
    line=mouth_line or bpy.data.objects.get('MouthLine')
    if line:
        parent_bone(line,rig,'head')
        for i in range(3):
            base=float(line.scale[i]);driver=line.driver_add('scale',i).driver;driver.type='SCRIPTED'
            v=driver.variables.new();v.name='laugh';v.targets[0].id=rig;v.targets[0].data_path='["laugh"]'
            driver.expression=f'{base}*max(0.0001,1-min(1,laugh*7))'
    character=[body]+list(arms.values())+list(eyes)+mouth['objects']+lids+([line] if line else [])
    print('SAFE_RIG actions',flush=True);actions=make_actions(rig,character)
    rig['mouth_boundary_vertices']=mouth['boundary_count'];rig['mouth_replaced_faces']=mouth['removed_faces']
    rig['mouth_cleanup_distance']=mouth['cleanup_distance']
    rig['mouth_merged_vertices']=mouth['merged_vertices']
    print('SAFE_RIG ready',mouth['boundary_count'],mouth['removed_faces'],flush=True)
    return rig,actions
