# Instagram Downloader
A Node.js script that allows you to download Posts from public Instagram profiles.\
The script creates a JSON file that contains all the information about the selected user, among with all of the fetched Posts data based on the [Max_posts_fetch] variable.\
After that, the program starts to download all fetched Posts inside 'fetched_data' folder.

## Folder Structure
```
.
├── node_modules
│   └── ...
└── fetched_data
    ├── -username-.json     # [User] JSON file
    └── -username-          # [User] Media folder
        ├── ...             # [Post] Media file
        ├── ...             # [Post] Media file
        └── ...             # [Post] Media file
```

## Installation
Use npm to install the package and all of its dependencies.
```
npm install
```

## Execution
```
*** Usage: node insta.js -username- [Images_ony]:Boolean [Max_posts_fetch]:Number

    Default:
        [Images_ony] = true
        [Max_posts_fetch] = ALL (Min value: 12)
```

## Run Demo:
![Screenshot](https://user-images.githubusercontent.com/10964246/105612031-c596d580-5dc1-11eb-9cc5-bd8da8fa827f.PNG)
