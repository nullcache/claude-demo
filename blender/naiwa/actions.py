"""奶娃的动作库（24fps）。每个动作是一串关键姿势，存成独立的 Action（带假用户，不会被清掉）。

  Idle   待机：呼吸、轻轻晃、眨一次眼（循环）
  Wave   挥手打招呼，嘴一张一合
  Laugh  捧腹大笑：双手捂肚子、仰头、笑到弯腰、全身发抖（meme 名场面）
  Walk   摇摆走路（原地踏步循环）
  Jump   开心跳（雀跃）：下蹲、起跳举手、落地
  Think  托腮思考

轴都是骨架空间：X 指向角色的左边，Y 指向身后，Z 向上（角色面朝 -Y）。
"""
from __future__ import annotations

import math

import bpy

from rig import Pose, X, Y, Z, finish_action, key_pose, new_action

# ───────────── 常用姿势 ─────────────

NEUTRAL = Pose()


def laugh_pose(bend=0.0, bounce=0.0, shake=0.0, open_=1.0):
    """bend：0 仰头大笑 → 1 笑弯了腰；bounce：身体上下颠；shake：左右抖。"""
    head_x = -18 + 30 * bend
    return Pose(
        root_loc=(0.0, 0.0, -0.006 * bend + bounce),
        hips=[(X, 4 * bend)],
        spine=[(X, -4 + 14 * bend), (Y, shake)],
        chest=[(X, -6 + 10 * bend), (Y, shake * 0.6)],
        head=[(X, head_x), (Y, -shake * 1.5)],
        upperarm_L=[(X, -30), (Y, 20)],
        upperarm_R=[(X, -30), (Y, -20)],
        forearm_L=[(X, -78), (Z, -32)],
        forearm_R=[(X, -78), (Z, 32)],
        hand_L=[(X, -12), (Z, -10)],
        hand_R=[(X, -12), (Z, 10)],
        thigh_L=[(X, -4 * bend)],
        thigh_R=[(X, -4 * bend)],
        shin_L=[(X, 6 * bend)],
        shin_R=[(X, 6 * bend)],
        laugh=open_,
    )


def wave_pose(swing=0.0, mouth=0.0):
    return Pose(
        spine=[(Y, 2)],
        chest=[(Y, 3)],
        head=[(Y, -7), (X, -4)],
        upperarm_R=[(Y, 98), (X, -18)],
        forearm_R=[(Y, 48 + swing)],
        hand_R=[(Y, 10 + swing * 0.6)],
        upperarm_L=[(Y, -6)],
        mouth=mouth,
    )


def walk_pose(phase):
    """phase 0..1：0 左脚在前着地，0.5 右脚在前着地。"""
    s = math.sin(2 * math.pi * phase)
    c = math.cos(2 * math.pi * phase)
    lift_l = max(0.0, -math.sin(2 * math.pi * (phase + 0.25)))  # 左腿摆动中抬起
    lift_r = max(0.0, math.sin(2 * math.pi * (phase + 0.25)))
    return Pose(
        root_loc=(0.014 * c, 0.0, 0.010 * abs(math.sin(2 * math.pi * phase + math.pi / 2)) - 0.004),
        hips=[(Y, 6 * c), (Z, 4 * s)],
        spine=[(Y, -3 * c)],
        chest=[(Z, -5 * s), (Y, -2 * c)],
        head=[(Y, -3 * c), (Z, 2 * s)],
        thigh_L=[(X, -24 * s - 10 * lift_l)],
        thigh_R=[(X, 24 * s - 10 * lift_r)],
        shin_L=[(X, 30 * lift_l)],
        shin_R=[(X, 30 * lift_r)],
        foot_L=[(X, -10 * s)],
        foot_R=[(X, 10 * s)],
        upperarm_L=[(X, 16 * s), (Y, -8)],
        upperarm_R=[(X, -16 * s), (Y, 8)],
        forearm_L=[(X, -10 - 6 * max(0, -s))],
        forearm_R=[(X, -10 - 6 * max(0, s))],
    )


CROUCH = Pose(
    root_loc=(0.0, 0.0, -0.05),
    hips=[(X, -4)],
    spine=[(X, 12)],
    chest=[(X, 6)],
    head=[(X, -8)],
    thigh_L=[(X, -32), (Y, -6)],
    thigh_R=[(X, -32), (Y, 6)],
    shin_L=[(X, 58)],
    shin_R=[(X, 58)],
    foot_L=[(X, -24)],
    foot_R=[(X, -24)],
    upperarm_L=[(X, 28), (Y, -10)],
    upperarm_R=[(X, 28), (Y, 10)],
    forearm_L=[(X, -15)],
    forearm_R=[(X, -15)],
)


def jump_air(h, arms=1.0, joy=0.8):
    return Pose(
        root_loc=(0.0, 0.0, h),
        spine=[(X, -6)],
        chest=[(X, -6)],
        head=[(X, -14)],
        thigh_L=[(X, -22), (Y, -8)],
        thigh_R=[(X, -22), (Y, 8)],
        shin_L=[(X, 38)],
        shin_R=[(X, 38)],
        foot_L=[(X, 18)],
        foot_R=[(X, 18)],
        upperarm_L=[(Y, -150 * arms), (X, -10)],
        upperarm_R=[(Y, 150 * arms), (X, -10)],
        forearm_L=[(Y, -15 * arms)],
        forearm_R=[(Y, 15 * arms)],
        laugh=joy,
    )


def think_pose(tilt=8.0, blink=0.0):
    return Pose(
        spine=[(X, 3)],
        chest=[(Z, 4)],
        head=[(Y, tilt), (X, 7), (Z, -6)],
        upperarm_R=[(X, -60), (Z, 20)],
        forearm_R=[(X, -115), (Z, 40)],
        hand_R=[(X, -30)],
        upperarm_L=[(X, -26), (Y, 22)],
        forearm_L=[(X, -84), (Z, -38)],
        hand_L=[(X, -8)],
        blink=blink,
    )


TEST_POSES = {
    'neutral': NEUTRAL,
    'laugh': laugh_pose(0.0),
    'laugh_bend': laugh_pose(1.0),
    'wave': wave_pose(0.0, 0.6),
    'walk': walk_pose(0.0),
    'jump': jump_air(0.14),
    'crouch': CROUCH,
    'think': think_pose(),
}


# ───────────── 动作 ─────────────

def idle(rig):
    act = new_action(rig, 'Idle')
    n = 96
    for f in range(1, n + 2, 6):  # 最后一帧 = 第一帧，循环无缝
        ph = (f - 1) / n
        br = math.sin(2 * math.pi * ph)
        sw = math.sin(2 * math.pi * ph + 1.2)
        blink = 1.0 if 58 <= f <= 62 else 0.0
        key_pose(rig, f, Pose(
            root_loc=(0, 0, -0.003 * (br + 1) / 2),
            spine=[(X, 1.2 * br), (Y, 1.0 * sw)],
            chest=[(X, -1.5 * br)],
            head=[(Y, 2.0 * sw), (X, 1.0 * br)],
            upperarm_L=[(Y, -2 - 2 * br)],
            upperarm_R=[(Y, 2 + 2 * br)],
            blink=blink,
        ))
    key_pose(rig, 57, Pose(blink=0.0))
    key_pose(rig, 60, Pose(blink=1.0))
    key_pose(rig, 63, Pose(blink=0.0))
    finish_action(act, cyclic=True)
    return act


def wave(rig):
    act = new_action(rig, 'Wave')
    key_pose(rig, 1, NEUTRAL)
    key_pose(rig, 12, wave_pose(-10, 0.0))
    for i, f in enumerate(range(18, 55, 6)):
        key_pose(rig, f, wave_pose(22 if i % 2 == 0 else -22, 0.7 if i % 2 == 0 else 0.15))
    key_pose(rig, 62, wave_pose(0, 0.0))
    key_pose(rig, 74, NEUTRAL)
    finish_action(act)
    return act


def laugh(rig):
    act = new_action(rig, 'Laugh')
    key_pose(rig, 1, NEUTRAL)
    key_pose(rig, 6, laugh_pose(0.0, 0.0, 0.0, 1.0))
    n_end = 120
    f = 9
    i = 0
    while f < n_end - 8:
        # 先仰头大笑，后半段笑弯了腰，再直起来
        t = (f - 9) / (n_end - 20)
        bend = math.sin(math.pi * min(1, max(0, (t - 0.25) / 0.6))) ** 2
        bounce = 0.012 if i % 2 == 0 else -0.004
        shake = 3.0 if i % 2 == 0 else -3.0
        key_pose(rig, f, laugh_pose(bend, bounce, shake, 1.0))
        f += 3
        i += 1
    key_pose(rig, n_end - 6, laugh_pose(0.0, 0.0, 0.0, 1.0))
    key_pose(rig, n_end, NEUTRAL)
    finish_action(act)
    return act


def walk(rig):
    act = new_action(rig, 'Walk')
    n = 32
    for f in range(1, n + 1, 2):
        key_pose(rig, f, walk_pose((f - 1) / n))
    key_pose(rig, n + 1, walk_pose(0.0))
    finish_action(act, cyclic=True)
    return act


def jump(rig):
    act = new_action(rig, 'Jump')
    key_pose(rig, 1, NEUTRAL)
    key_pose(rig, 10, CROUCH)
    key_pose(rig, 15, jump_air(0.03, 0.6, 0.4))
    key_pose(rig, 22, jump_air(0.17, 1.0, 1.0))
    key_pose(rig, 28, jump_air(0.08, 0.9, 1.0))
    key_pose(rig, 32, CROUCH)
    key_pose(rig, 40, Pose(laugh=0.4))
    key_pose(rig, 50, NEUTRAL)
    finish_action(act)
    return act


def think(rig):
    act = new_action(rig, 'Think')
    key_pose(rig, 1, NEUTRAL)
    key_pose(rig, 14, think_pose(8))
    key_pose(rig, 34, think_pose(12))
    key_pose(rig, 40, think_pose(12, 1.0))
    key_pose(rig, 43, think_pose(12, 0.0))
    key_pose(rig, 60, think_pose(9))
    key_pose(rig, 72, NEUTRAL)
    finish_action(act)
    return act


ALL = [idle, wave, laugh, walk, jump, think]


def make_all(rig):
    acts = [fn(rig) for fn in ALL]
    # 默认挂上待机动作
    rig.animation_data.action = acts[0]
    sc = bpy.context.scene
    sc.render.fps = 24
    sc.frame_start, sc.frame_end = 1, 96
    return acts
