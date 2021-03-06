import { Component, OnInit } from '@angular/core';
import { Http, Response } from '@angular/http';
import { Observable } from 'rxjs/Rx';
import { HTTP_PROVIDERS } from '@angular/http';
import { XtermTerminalComponent } from './xterm-terminal/xterm-terminal.component';
declare var require: any;
var shellwords = require("shellwords");

@Component({
  selector: 'my-app',
  templateUrl: 'app/app.component.html',
  styleUrls: ['app/app.component.css'],
  providers: [ HTTP_PROVIDERS ],
  directives: [ XtermTerminalComponent ]
})

export class AppComponent implements OnInit {
  // template values
  instructions: any;
  title: string;

  // taken as input by xterm terminal componen
  response: string;
  shell: string;

  // colors for responses
  red: string = " [31m";
  white: string = " [37m";
  black: string = " [30m";

  matchFound: boolean; // helps to handle no match found response
  counter: number = 0; // keeps track of step number count
  userCommand: string; // used to display better error msg when no match is found
  extraCmds: string = ''; // used to display extra commands available (from commands.yml)

  // arrays of data parsed from json files
  commandsArray: any = [];
  instructionsArray: any = [];

  constructor(private http: Http) { }

  ngOnInit() {
    // load json files
    this.getInstructions();
    this.getResponses();
    this.getExtraCmds();
  }

  // called when command entered is 'next' or 'prev'
  // modifies value of counter and calls displayInstructions
  updateInstructions(step) {
    let totalSteps = this.instructionsArray.length - 1;
    let msg = Math.random();
    if (step === 'next') {
      if (this.counter < totalSteps) {
        this.counter += 1;
      }
      this.response = this.black + 'next' + msg;
    } else if (step === 'prev') {
      if (this.counter > 0) {
        this.counter -= 1;
      }
      this.response = this.black + 'prev' + msg;
    }
    this.displayInstructions();
  }

  // display instructions based on value of counter and
  // format text to remove triple backticks. if the user has reached
  // then end of the demo, display a message containing extra commands that have been
  // enabled in the demo
  displayInstructions() {
    if (this.counter === this.instructionsArray.length - 1) {
      this.title = "the end; that's all folks!";
      this.instructions = "here are some other commands you can try out: \r\n\r\n" + this.extraCmds;
    } else {
      if (this.instructionsArray[this.counter][1]) {
        this.title = this.instructionsArray[this.counter][0];
        let text = this.instructionsArray[this.counter][1];
        let formattedText = text.replace(/```/g, '');
        this.instructions = formattedText;
      } else {
        this.instructions = 'Sorry, something seems to have gone wrong. Please try refreshing your browser.';
      }
    }
  }

  // called when a new value is emitted for command
  // checks for a match, calls parseInspecShell if shell is inspec-shell
  // and calls checkCommand if none of the first commands match
  evalCommand(command) {
    this.userCommand = command;
    if (command.match(/^next\s*/)) {
      this.updateInstructions('next');
    }
    else if (command.match(/^prev\s*/)) {
      this.updateInstructions('prev');
    }
    else if (this.shell === 'inspec-shell') {
      this.parseInspecShell(command);
    }
    else if (command.match(/^ls\s*/)) {
      this.response = this.white + "README.md";
    }
    else if (command.match(/^pwd\s*/)) {
      this.response = this.white + "anonymous-web-user/inspec";
    }
    else if (command.match(/^cat\s*README.md\s*/i)) {
      this.response = this.white + "Only a few commands are implemented in this terminal.  Please follow the demo";
    }
    else if (command.match(/^less\s*README.md\s*/i)) {
      this.response = this.white + "Only a few commands are implemented in this terminal.  Please follow the demo.";
    }
    else {
      this.checkCommand(command);
    }
  }

  // if the shell is inspec-shell, we want to exit the shell env on 'exit'
  // format the command for checkCommand by using shellwords.escape and
  // adding 'echo' and 'inspec shell' to match command from commands.json
  parseInspecShell(command) {
    if (command.match(/^exit\s*/))  {
      this.shell = '';
      this.response = '';
    }
    else if (command.match(/^pwd\s*/)) {
      this.response = this.white + "anonymous-web-user/inspec-shell";
    }
    else {
      let escaped_cmd;
      let formatted_cmd;
      // TODO: make this better
      // I don't really like what we're doing here when we have a
      // describe and control block, but I had a lot of trouble getting this
      // to work because of the new lines carriage returns in the command from commands.json
      // so at the moment we're splitting the command on "do" and assuming a match if that first
      // result group matches (everything before do) :/
      if (command.match(/^describe.*|^control/)) {
        let split_cmd = command.split('do');
        escaped_cmd = shellwords.escape(split_cmd[0]);
        formatted_cmd = 'echo.*' + escaped_cmd ;
      } else {
        escaped_cmd = shellwords.escape(command)
        formatted_cmd = 'echo.*' + escaped_cmd + '.*inspec.*shell';
      }
      let regex_compatible = formatted_cmd.replace(/\W+/g, '.*');
      this.checkCommand(regex_compatible);
    }
  }

  // takes the command as input, replaces all white space with regex whitespace matcher
  // and creates a new regex. check if the regex matches any of the keys in the commandsArray
  // if it matches, we set matchFound to true and call displayResult. if it doesn't match,
  // we display a default error message
  checkCommand(command) {
    let dir = 'app/responses/';
    let cmd = command.replace(/ /g,"\\s*")
    let regexcmd = new RegExp(('^'+cmd+'$'), 'm')
    this.matchFound = false;
    for (var i = 0; i < this.commandsArray.length; i++) {
      let object = this.commandsArray[i]
      for (let key in object) {
        if (key.match(regexcmd)) {
          this.matchFound = true;
          let value = object[key];
          this.http.get(dir + value).subscribe(data => {
            this.displayResult(command, data);
          },
          err => console.error(err));
        }
      }
    }
    // if no match is found, we check if the command entered was inspec exec something
    // and if it is respond appropriately ('could not fetch inspec profile in ''), otherwise
    // respond with 'invalid command' and the command entered
    if (this.matchFound === false) {
      let msg = Math.random();
      if (command.match(/^inspec exec\s*.*/)) {
        let target = command.match(/^inspec exec\s*(.*)/)
        if (target[1].match(/.*-t.*|.*-b.*/)) {
          this.response = this.red + "Sorry, we haven't figured out how to handle the transport options in this demo just yet." + this.black + msg;
        } else {
          this.response = this.red + "Could not fetch inspec profile in '" + target[1] + "' " + this.black + msg;
        }
      } else {
        this.response = this.red + 'invalid command: ' + this.userCommand + this.black + msg;
      }
    }
  }

  // if the command if inspec shell, we also need to set the shell variable to
  // inspec shell. print response value and random msg (to ensure recognition of value change by xterm
  // terminal component)
  displayResult(command, data) {
    if (command.match(/^inspec\s*shell\s*$/)) {
      this.shell = 'inspec-shell';
    }
    let msg = Math.random();
    this.response = this.white + data['_body'] + this.black + msg;
  }

  // load json file for instructions and save to instructionsArray
  // call displayInstructions to load first set of instructions
  getInstructions() {
    this.http.get('instructions.json')
      .subscribe(data => {
        this.instructionsArray = JSON.parse(data['_body']);
        this.displayInstructions();
      },
      err => console.error(err)
    );
  }

  // load json file for commands and push each object to commandsArray
  getResponses() {
    this.http.get('commands.json')
      .subscribe(data => {
        let result = JSON.parse(data['_body']);
        for (var i = 0; i < result.length; i++) {
          let object = result[i][0];
          this.commandsArray.push(object);
        }
      },
      err => console.error(err)
    );
  }

  // load json file for extra commands to display extra commands available to user
  getExtraCmds() {
    this.http.get('extra_commands.json')
      .subscribe(data => {
        let result = JSON.parse(data['_body']);
        for (var i = 0; i < result.length; i++) {
          this.extraCmds += result[i] + "\r\n";
        }
      },
      err => console.error(err)
    );
  }
}