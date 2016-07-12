# OpsWorks CLI
[![CircleCI](https://circleci.com/gh/plivo/opsworks.svg?style=shield)](https://circleci.com/gh/plivo/opsworks)

The missing OpsWorks CLI, run commands across stacks (and across regions), check your instances, apps, deployments, ELBs, with a smart filtering system.

[![asciicast](https://asciinema.org/a/1fvxew0u6684jhvkj53ekkduc.png)](https://asciinema.org/a/1fvxew0u6684jhvkj53ekkduc?theme=solarized-dark)

## Installation

`npm install -g opsworks`

## Usage

```
opsworks <command> [args]
```

The OpsWorks CLI has multiple commands, similar to `git`, `apt-get` or `brew`. When you run `opsworks` with no arguments, you get an interactive prompt.

### GUI / Prompt

For simple tasks, just use `opsworks` without a command and you'll get an interactive prompt.

![Prompt](https://raw.githubusercontent.com/plivo/opsworks/master/img/prompt.png)

### Configuration

`opsworks` needs to access the AWS API using your credentials. Just like the AWS SDK or CLI, it will look for credentials in two places :

* From the shared credentials file (`~/.aws/credentials`)
* From environment variables

To use the credentials file, create a `~/.aws/credentials` file based on the template below :

```
[default]
aws_access_key_id=your_access_key
aws_secret_access_key=your_secret_key
```

### Commands

| command     | description                 |
|-------------|-----------------------------|
| stacks      | list OpsWorks stacks        |
| deployments | list OpsWorks deployments   |
| instances   | list instances              |
| apps        | list apps                   |
| elbs        | list Elastic Load Balancers |
| update      | update cookbooks            |
| setup       | run setup recipes           |
| configure   | run configure recipes       |
| deploy      | deploy specified app        |
| recipes     | run specified recipes       |

#### Shared options for these commands

* `-f` Specify filter (see below)
* `-u` Update cookbooks before running the command
* `-y` Do not ask for confirmation 

**Note:** by default, when you do not specify `-y`, the CLI will display a summary of what commands it will run and on which layer of which stacks as a precaution.

#### Filtering

Any `opsworks` command accepts filters. There are three built-in filters :

| field  | description                    |
|--------|--------------------------------|
| layer  | The **Shortname** of the layer |
| stack  | The **Name** of the stack      |
| region | The stack's **region**         |

The format is `field:filter,field2:filter2,...`
You can use wildcards, or even use regexes.

For example the command bellow would match all stacks whose name contain `wordpress`, and only include their **database** layer.

```
opsworks instances -f 'stack:*wordpress*,layer:database'
```

Using regexes to check ELBs of two wordpress stacks at once :

```
opsworks instances -f 'stack:(prod|staging)-wordpress'
```

Additionally, if you use [custom JSON](http://docs.aws.amazon.com/opsworks/latest/userguide/workingstacks-json.html) on your stacks or layers, you can use arbitrary filters. For example, if your custom JSON has an **env** variable, this would work :

```
opsworks instances -f 'env:production'
```

## Issues?

Please feel free to [open an issue](https://github.com/plivo/opsworks/issues/new) if you find a bug or to request a feature. Please make sure to include all relevant logs.

## Authors

Developed by [Tristan Foureur](https://github.com/esya) for [Plivo](https://www.plivo.com)

## License

Copyright &copy; Plivo Inc.

All code is licensed under the GPL, v3 or later. See `LICENSE.md` file for details.
