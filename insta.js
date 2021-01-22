// Instagram Public Profile Posts Downloader //

const axios = require('axios');
const fs = require('fs');
const colors = require('colors');

const args = process.argv.slice(2);		// [0]=='node' && [1]='...script_path...'
if (args.length < 1
	|| (args.length === 2 && !['true', 'false'].includes(args[1]))
	|| (args.length === 3 && isNaN(args[2]) || parseInt(args[2]) < 12)
	|| args.length > 3) {
	console.error('*** Usage: node insta.js -username- [Images_ony]:Boolean [Max_posts_fetch]:Number\n\n\tDefault:\n\t\t[Images_ony] = true\n\t\t[Max_posts_fetch] = ALL (Min value: 12)');
	process.exit(1);
}

const username = args[0];
const user_url = `https://www.instagram.com/${username}`;

const download_photos_and_videos = (args.length >= 2) ? !(args[1] == 'true') : false;
const max_posts_fetch = (args.length === 3) ? parseInt(args[2]) : Number.MAX_SAFE_INTEGER;

const working_dir = './fetched_data'; !fs.existsSync(working_dir) && fs.mkdirSync(working_dir);
const user_dir_path = `${working_dir}/${username}`;
const user_json_path = `${user_dir_path}.json`;

let user_id;
let user_username;
let user_fullname;
let user_profile_pic;
let user_followers;
let user_following;
let user_total_posts;
let user_posts_has_next_page;
let user_posts_next_page_cursor;
let user_fetched_posts = 0;
let user_fetched_photos = 0;
let user_fetched_videos = 0;
let postsArray = [];
let proccessed_post;

//////////////////////////////////////////////////////////////////////////////

class Post {
	constructor(post_num, is_video, video_url, taken_at_timestamp, location_name, accessibility_caption, media_to_caption_text, display_url, dimensions_height, dimensions_width) {
		this.post_num = '#' + post_num;
		this.media_to_caption_text = media_to_caption_text;
		this.location_name = location_name;
		this.taken_at_timestamp = taken_at_timestamp;
		this.dateTime = new Date(parseInt(taken_at_timestamp + '000')).toLocaleString('el-gr');
		this.is_video = is_video;
		this.video_url = video_url;
		this.display_url = display_url;
		this.dimensions = { height: dimensions_height, width: dimensions_width };
		this.accessibility_caption = accessibility_caption;
		this.children_posts = [];
	}
}

class ChildrenPost {
	constructor(is_video, video_url, display_url, dimensions, accessibility_caption) {
		this.is_video = is_video;
		this.video_url = video_url;
		this.display_url = display_url;
		this.dimensions = dimensions;
		this.accessibility_caption = accessibility_caption;
	}
}

//////////////////////////////////////////////////////////////////////////////

function fetchPosts(edge_owner_to_timeline_media, parent = null) {
	let addedPosts = [];

	for (let edge of edge_owner_to_timeline_media.edges) {
		let node = edge.node;

		if (edge.node.edge_sidecar_to_children !== undefined) {
			let [newPost, ...childPosts] = fetchPosts(edge.node.edge_sidecar_to_children, node);

			newPost.children_posts = childPosts.map(post => new ChildrenPost(post.is_video, post.video_url, post.display_url, post.dimensions, post.accessibility_caption));

			proccessed_post--;
			user_fetched_posts++;
			postsArray.push(newPost);

			continue;
		}

		node.is_video && user_fetched_videos++; !node.is_video && user_fetched_photos++;
		let newPost = new Post(
			proccessed_post,
			node.is_video,
			node.is_video ? node.video_url : undefined,
			parent === null ? node.taken_at_timestamp : parent.taken_at_timestamp,
			parent === null ? ((node.location === null || node.location === undefined) ? null : node.location.name) : ((parent.location === null || parent.location === undefined) ? null : parent.location.name),
			node.accessibility_caption,
			parent === null ? ((node.edge_media_to_caption === undefined) ? null : (node.edge_media_to_caption.edges.length === 0 ? null : node.edge_media_to_caption.edges[0].node.text)) : ((parent.edge_media_to_caption === undefined) ? null : (parent.edge_media_to_caption.edges.length === 0 ? null : parent.edge_media_to_caption.edges[0].node.text)),
			node.display_url,
			node.dimensions.height,
			node.dimensions.width);

		if (parent === null) {
			proccessed_post--;
			user_fetched_posts++;
			postsArray.push(newPost);
		}

		addedPosts.push(newPost);
	}

	return addedPosts;
};

async function downloadPostMedia(post, post_num) {
	if (download_photos_and_videos || !post.is_video) {
		let mediaUrl;
		let savePath;

		if (!post.is_video) {
			mediaUrl = post.display_url;
		} else {
			mediaUrl = post.video_url;
		}

		let mediaFile = post_num + '_' + mediaUrl.substring(mediaUrl.lastIndexOf('/') + 1, mediaUrl.indexOf('?'));
		savePath = `${user_dir_path}/${mediaFile}`;

		if (!fs.existsSync(savePath)) {
			await axios({
				method: "get",
				url: mediaUrl,
				responseType: "stream"
			}).then(async function (response) {
				return new Promise(resolve => {
					let stream = fs.createWriteStream(savePath);
					response.data.pipe(stream);
					stream.on('finish', resolve);
				});
			});
		}
	}
}


function formatNumber(number) {
	let SI_SYMBOL = ["", "k", "M", "B", "T", "Q"];

	// what tier? (determines SI symbol)
	let tier = Math.log10(Math.abs(number)) / 3 | 0;

	// if zero, we don't need a suffix
	if (tier == 0) return number;

	// get suffix and determine scale
	let suffix = SI_SYMBOL[tier];
	let scale = Math.pow(10, tier * 3);

	// scale the number
	let scaled = number / scale;

	// format number and add suffix
	let abbreviateNum = scaled.toFixed(tier) + suffix;

	// convert number to locale string
	let numberToLocaleStr = number.toString().replace(/\B(?<!\.\d*)(?=(\d{3})+(?!\d))/g, ".");

	return `${numberToLocaleStr} (${abbreviateNum})`;
}

//////////////////////////////////////////////////////////////////////////////

axios.get(user_url)
	.then(async function (response) {
		let html = response.data;	// This is the full instagram HTML page for the selected user 

		let start = html.indexOf('{"config":');
		let end = html.indexOf('};</script>') + 1;

		let dataStr = html.substring(start, end);
		let data = JSON.parse(dataStr);

		let user = data.entry_data.ProfilePage[0].graphql.user;					// All user's info is here ! ==> 'undefined' if IP gets banned after multiple attempts!
		let edge_owner_to_timeline_media = user.edge_owner_to_timeline_media;	// edge_owner_to_timeline_media.edges[].node

		user_id = user.id;
		user_username = user.username;
		user_fullname = user.full_name;
		user_profile_pic = user.profile_pic_url_hd;
		user_followers = formatNumber(user.edge_followed_by.count);
		user_following = formatNumber(user.edge_follow.count);
		user_total_posts = proccessed_post = edge_owner_to_timeline_media.count;
		user_posts_has_next_page = edge_owner_to_timeline_media.page_info.has_next_page;
		user_posts_next_page_cursor = edge_owner_to_timeline_media.page_info.end_cursor;

		console.log(`Fullname: `.yellow + `${user_fullname}`);
		console.log(`User_ID: `.yellow + `${user_id}`);
		console.log(`Username: `.yellow + `${user_username}`);
		console.log(`Followers: `.yellow + `${user_followers}`);
		console.log(`Following: `.yellow + `${user_following}`);
		console.log(`Total_Posts: `.yellow + `#${user_total_posts}`);
		console.log(`Max_Posts_Fetch: `.yellow + `${max_posts_fetch === Number.MAX_SAFE_INTEGER ? 'ALL' : '#' + max_posts_fetch}`);
		console.log(`Download_photos_and_videos: `.yellow + `${download_photos_and_videos} ${download_photos_and_videos === false ? '(Images only)' : ''}`);

		fetchPosts(edge_owner_to_timeline_media);

		while (user_posts_has_next_page && user_fetched_posts < max_posts_fetch) {
			let nextPagePosts = 50;		// The max value that API can accept
			if (max_posts_fetch - user_fetched_posts < nextPagePosts) nextPagePosts = max_posts_fetch - user_fetched_posts;

			let next_page_query = `https://www.instagram.com/graphql/query/?query_hash=003056d32c2554def87228bc3fd9668a&variables=%7B%22id%22:%22${user_id}%22,%22first%22:${nextPagePosts},%22after%22:%22${user_posts_next_page_cursor}%22%7D`;

			await axios.get(next_page_query)
				.then(function (response) {
					let responseData = response.data;
					let next_page_edge_owner_to_timeline_media = responseData.data.user.edge_owner_to_timeline_media;

					user_posts_has_next_page = next_page_edge_owner_to_timeline_media.page_info.has_next_page;
					user_posts_next_page_cursor = next_page_edge_owner_to_timeline_media.page_info.end_cursor;

					fetchPosts(next_page_edge_owner_to_timeline_media);
				})
				.catch(function (error) {
					console.error(`${error.name}: ${error.message}`);
				});
		}

		user = {
			user_fullname,
			user_id,
			user_username,
			user_url,
			user_followers: user_followers.toString(),
			user_following: user_following.toString(),
			user_profile_pic,
			user_total_posts,
			user_fetched_posts,
			user_fetched_photos,
			user_fetched_videos
		}

		return fs.writeFile(user_json_path, JSON.stringify({ user, posts: postsArray }), (err) => { if (err) console.error(err) });
	})
	.then(async function () {
		console.log(`\n*** File '${user_json_path}' successfully created! Start fetching ${user_fetched_posts} latest Posts...`.green);

		!fs.existsSync(user_dir_path) && fs.mkdirSync(user_dir_path);

		console.log();
		proccessed_post = 1;
		for (let post of postsArray) {
			process.stdout.write(`==> Downloading ${proccessed_post++} of ${user_fetched_posts} total fetched Posts...\r`);
			await downloadPostMedia(post, post.post_num);
			for (let children_post of post.children_posts) {
				await downloadPostMedia(children_post, post.post_num);
			}
		}

		if (!download_photos_and_videos) {
			console.log(`\n*** Download completed! Got `.red + `${user_fetched_photos}` + ` total Images.`.red);
		} else {
			console.log(`\n*** Download completed! Got `.red + `${user_fetched_photos}` + ` total Images and `.red + `${user_fetched_videos}` + ` total Videos.`.red);
		}
	})
	.catch(function (error) {
		if (error.name === 'TypeError' && error.message === "Cannot read property '0' of undefined") {
			console.error(`*** Instagram banned your IP after multiple download attempts and requires a Login to allow communication.\n\t!!! Get a new IP to keep using this tool or try again later !!!`);
		} else {
			console.error(`${error.name}: ${error.message}`);
		}
	});