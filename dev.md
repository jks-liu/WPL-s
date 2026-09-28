# Version bump checklist

Run `npm run version:bump` to bump the patch version in `package.json` and
`package-lock.json`. Other options:

```sh
npm run version:bump -- current       # Print the synchronized version
npm run version:bump -- minor         # Bump minor and reset patch
npm run version:bump -- major         # Bump major and reset minor/patch
npm run version:bump -- 2.0.0         # Set an exact version
npm run version:bump -- patch --build # Bump and create a VSIX with npm run vsix
npm run version:bump -- patch --no-build # Explicitly skip packaging (default)
```

The script does not create a commit or Git tag. With `--build`, the version
files remain bumped if VSIX packaging fails.

- Update readme
- Update changelog
- Update document
- bump version
- Commit to github
- vsce publish
- 1. Update the test markdown
  2. Commit to github
  3. Publish to zhihu
- Publish readme to zhihu
- Promote
  * oschina
  * cnblogs
  * juejin
  * jianshu
  * zhihu
  * github
  * bilibili
  * medium
  * twitter
  * facebook
  * linkedin
  * weibo
  * reddit
  * telegram
  
