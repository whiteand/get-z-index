# get-z-index

This is library to help you to manage your z indices in declarative way.

## Example

Let's assume that your application has four layers: `page`, `header`, `modals` and `notifications`.

Lets assume that header should be above the page. Modal above the header and all notifications above modal and header.

```javascript
const RULES = [
  ['page', 'header'],
  ['header', 'modals'],
  ['modals', 'notifications'],
];
```

While we have this `RULES` array we can create function `getZIndex` which will return z-index for each layer based on this rules.

```javascript
import { compile } from 'get-z-index';

const getZIndex = compile(RULES);
```

And now we can use it:

```javascript
getZIndex('page'); // => 0
getZIndex('header'); // => 1
getZIndex('modals'); // => 2
getZIndex('notifications'); // => 3
```

Sometimes there is need to be able to show several modals on the screen and several notifications.

Lets define maximum amount of modals and notifications in the dictionary:

```javascript
const MAX_NUMBER_DICT = {
  modals: 3,
  notifications: 10,
};
```

Lets create another version of `getZIndex` which will use this information:

```javascript
import { compile } from 'get-z-index';

const getZIndex = compile(RULES, MAX_NUMBER_DICT);
```

Lets calculate all possible zIndices for all layers and items inside layer with usage of second parameter of `getZIndex` function - `index`.

```javascript
getZIndex('page'); // => 0
getZIndex('header'); // => 1
getZIndex('modals'); // => 2
getZIndex('modals', 1); // => 3, z-index for second modal above the first modal
getZIndex('modals', 2); // => 4
getZIndex('notifications'); // => 5
```

Pretty much it! Use and enjoy!
