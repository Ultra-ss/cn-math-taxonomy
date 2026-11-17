(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.CnmAvatarCatalog = factory();
    }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    var scriptURL = typeof document !== 'undefined' && document.currentScript
        ? document.currentScript.src
        : '';
    var DEFAULT_CAT = 'cat-snow';

    function avatarImage(id, catId) {
        var directory = catId === 'cat-ginger' ? 'ginger/'
            : catId === 'cat-tuxedo' ? 'tuxedo/' : '';
        var path = 'avatars/' + directory + id + '.svg';
        if (scriptURL) {
            return new URL(path, scriptURL).href;
        }
        return '/assets/' + path;
    }

    var defaultAvatar = {
        id: 'default',
        name: '星芽小探员',
        description: '带着好奇心出发，发现每一天的小小惊喜。',
        image: avatarImage('default', DEFAULT_CAT),
        catId: DEFAULT_CAT
    };

    var skins = [
        { id: 'skin-01', name: '星河领航员', description: '循着星光出发，让好奇心带你发现新世界。' },
        { id: 'skin-02', name: '月湾魔法师', description: '收集月光里的灵感，把温柔化作小小魔法。' },
        { id: 'skin-03', name: '森野守护者', description: '倾听树叶与小动物的声音，守护身边的绿意。' },
        { id: 'skin-04', name: '深海探险家', description: '带着勇气潜入蔚蓝，发现海底安静的奇迹。' },
        { id: 'skin-05', name: '云朵飞行员', description: '乘着轻柔的风，让每一个梦想慢慢起飞。' },
        { id: 'skin-06', name: '极光科学家', description: '观察天空的颜色，用一个个问题点亮发现。' },
        { id: 'skin-07', name: '花园画家', description: '把花香和四季装进画笔，画出自己的色彩。' },
        { id: 'skin-08', name: '沙丘旅人', description: '沿着沙丘留下脚印，在旅途中学会从容。' },
        { id: 'skin-09', name: '霜雪精灵', description: '珍藏雪花的细节，把清亮的善意送给伙伴。' },
        { id: 'skin-10', name: '日光骑士', description: '迎着阳光勇敢前行，用热心照亮每一天。' }
    ].map(function (skin) {
        skin.image = avatarImage(skin.id, DEFAULT_CAT);
        skin.catId = DEFAULT_CAT;
        return skin;
    });

    var cats = [
        { id: 'cat-snow', name: '奶油白猫' },
        { id: 'cat-ginger', name: '橘子猫' },
        { id: 'cat-tuxedo', name: '奶牛猫' }
    ].map(function (cat) {
        cat.image = avatarImage('default', cat.id);
        return cat;
    });

    function get(id, catId) {
        var selectedCat = DEFAULT_CAT;
        for (var c = 0; c < cats.length; c += 1) {
            if (cats[c].id === catId) {
                selectedCat = catId;
                break;
            }
        }

        var avatar = defaultAvatar;
        for (var i = 0; i < skins.length; i += 1) {
            if (skins[i].id === id) {
                avatar = skins[i];
                break;
            }
        }

        if (selectedCat === DEFAULT_CAT) {
            return avatar;
        }
        return {
            id: avatar.id,
            name: avatar.name,
            description: avatar.description,
            image: avatarImage(avatar.id, selectedCat),
            catId: selectedCat
        };
    }

    return {
        cats: cats,
        DEFAULT_CAT: DEFAULT_CAT,
        skins: skins,
        defaultAvatar: defaultAvatar,
        get: get
    };
}));
